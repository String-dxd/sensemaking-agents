import OpenAI from 'openai'
import { OpenAIRealtimeWS } from 'openai/realtime/ws'
import type {
  RealtimeClientEvent,
  RealtimeResponse,
  RealtimeServerEvent,
} from 'openai/resources/realtime/realtime'
import type { MirrorOutputDraft } from '~/agents/schemas'
import {
  getOpenAIRealtimeMirrorConfig,
  type OpenAIRealtimeMirrorConfig,
  safetyIdentifierForStudent,
} from './config'
import {
  buildRealtimeMirrorRepairInput,
  buildRealtimeMirrorResponseInstructions,
  buildRealtimeMirrorSessionConfig,
  buildRealtimeMirrorUserInput,
} from './mirror-prompt'
import { parseMirrorRealtimeText } from './parse'

const DEFAULT_TIMEOUT_MS = 30_000

type RealtimeEventHandler = (event: RealtimeServerEvent) => void
type RealtimeErrorHandler = (error: Error) => void

export interface RealtimeMirrorSocket {
  on(event: 'event', handler: RealtimeEventHandler): unknown
  on(event: 'error', handler: RealtimeErrorHandler): unknown
  off?(event: 'event', handler: RealtimeEventHandler): unknown
  off?(event: 'error', handler: RealtimeErrorHandler): unknown
  send(event: RealtimeClientEvent): void
  close(props?: { code: number; reason: string }): void
  socket?: {
    readyState?: number
    once?: (event: 'open' | 'error', handler: (error?: Error) => void) => void
  }
}

export interface RunOpenAIRealtimeMirrorInput {
  studentId: string
  transcript: string
}

export interface RunOpenAIRealtimeMirrorDeps {
  config?: OpenAIRealtimeMirrorConfig
  connect?: (config: OpenAIRealtimeMirrorConfig, studentId: string) => Promise<RealtimeMirrorSocket>
  timeoutMs?: number
}

export class OpenAIRealtimeMirrorError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'OpenAIRealtimeMirrorError'
  }
}

export async function runOpenAIRealtimeMirror(
  input: RunOpenAIRealtimeMirrorInput,
  deps: RunOpenAIRealtimeMirrorDeps = {},
): Promise<MirrorOutputDraft> {
  const config = deps.config ?? getOpenAIRealtimeMirrorConfig()
  const realtime =
    deps.connect !== undefined
      ? await deps.connect(config, input.studentId)
      : await connectOpenAIRealtimeSocket(config, input.studentId)

  try {
    await waitForSocketOpen(realtime)
    const text = await runRealtimeMirrorTextTurn(
      realtime,
      buildRealtimeMirrorUserInput(input.transcript),
      config.model,
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    const parsed = parseMirrorRealtimeText(text)
    if (parsed) return parsed

    const repairedText = await runRealtimeMirrorTextTurn(
      realtime,
      buildRealtimeMirrorRepairInput(text),
      config.model,
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    const repaired = parseMirrorRealtimeText(repairedText)
    if (repaired) return repaired
    throw new OpenAIRealtimeMirrorError('Realtime Mirror returned unparseable JSON.')
  } catch (err) {
    if (err instanceof OpenAIRealtimeMirrorError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    throw new OpenAIRealtimeMirrorError(msg, err)
  } finally {
    realtime.close({ code: 1000, reason: 'Mirror run complete' })
  }
}

async function connectOpenAIRealtimeSocket(
  config: OpenAIRealtimeMirrorConfig,
  studentId: string,
): Promise<RealtimeMirrorSocket> {
  const client = new OpenAI({ apiKey: config.apiKey })
  return OpenAIRealtimeWS.create(client, {
    model: config.model,
    options: {
      headers: {
        'OpenAI-Safety-Identifier': safetyIdentifierForStudent(studentId),
      },
    },
  })
}

async function runRealtimeMirrorTextTurn(
  realtime: RealtimeMirrorSocket,
  userText: string,
  model: string,
  timeoutMs: number,
): Promise<string> {
  const textPromise = waitForRealtimeText(realtime, timeoutMs)
  realtime.send({
    type: 'session.update',
    session: buildRealtimeMirrorSessionConfig({ model }),
  })
  realtime.send({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: userText }],
    },
  })
  realtime.send({
    type: 'response.create',
    response: {
      output_modalities: ['text'],
      max_output_tokens: 1000,
      instructions: buildRealtimeMirrorResponseInstructions(),
      metadata: {
        agent: 'mirror',
        provider: 'openai_realtime',
      },
    },
  })
  return textPromise
}

function waitForRealtimeText(realtime: RealtimeMirrorSocket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let latestText = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new OpenAIRealtimeMirrorError('Realtime Mirror timed out.'))
    }, timeoutMs)

    const onEvent: RealtimeEventHandler = (event) => {
      if (event.type === 'response.output_text.done') {
        latestText = event.text
      }
      if (event.type === 'response.done') {
        const status = event.response.status
        if (status && status !== 'completed') {
          cleanup()
          reject(new OpenAIRealtimeMirrorError(`Realtime Mirror response ended with ${status}.`))
          return
        }
        cleanup()
        resolve(latestText || extractTextFromRealtimeResponse(event.response))
      }
    }
    const onError: RealtimeErrorHandler = (error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      clearTimeout(timer)
      realtime.off?.('event', onEvent)
      realtime.off?.('error', onError)
    }

    realtime.on('event', onEvent)
    realtime.on('error', onError)
  })
}

function extractTextFromRealtimeResponse(response: RealtimeResponse): string {
  const parts: string[] = []
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if ('text' in part && typeof part.text === 'string') parts.push(part.text)
      if ('transcript' in part && typeof part.transcript === 'string') parts.push(part.transcript)
    }
  }
  return parts.join('\n').trim()
}

function waitForSocketOpen(realtime: RealtimeMirrorSocket): Promise<void> {
  const readyState = realtime.socket?.readyState
  if (readyState === undefined || readyState === 1) return Promise.resolve()
  return new Promise((resolve, reject) => {
    realtime.socket?.once?.('open', () => resolve())
    realtime.socket?.once?.('error', (error) =>
      reject(error ?? new Error('Realtime socket failed.')),
    )
  })
}
