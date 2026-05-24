import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime'
import { describe, expect, it, vi } from 'vitest'
import {
  buildRealtimeMirrorLiveInstructions,
  buildRealtimeMirrorResponseInstructions,
} from '~/agents/openai-realtime/mirror-payloads'
import {
  type RealtimeMirrorSocket,
  runOpenAIRealtimeMirror,
} from '~/agents/openai-realtime/mirror-runner'
import { parseMirrorRealtimeText } from '~/agents/openai-realtime/parse'

describe('OpenAI Realtime Mirror runner', () => {
  it('returns parsed Mirror output from a Realtime text response', async () => {
    const socket = new FakeRealtimeSocket([
      JSON.stringify({
        validation: 'That mattered.',
        inferred_meaning: 'Maybe it felt important because it was yours.',
        story_reframe: 'You made the thing and noticed it mattered.',
      }),
    ])
    const connect = vi.fn(async () => socket)

    const output = await runOpenAIRealtimeMirror(
      { studentId: 'demo', transcript: 'I built the project myself.' },
      {
        config: {
          apiKey: 'sk-test',
          model: 'gpt-realtime',
          callsUrl: 'https://api.openai.test/v1/realtime/calls',
        },
        connect,
      },
    )

    expect(connect).toHaveBeenCalledOnce()
    expect(socket.sent[0]).toMatchObject({
      type: 'session.update',
      session: { type: 'realtime', model: 'gpt-realtime', output_modalities: ['text'] },
    })
    expect(socket.sent.map((event) => event.type)).toEqual([
      'session.update',
      'conversation.item.create',
      'response.create',
    ])
    expect(output).toEqual({
      validation: 'That mattered.',
      inferred_meaning: 'Maybe it felt important because it was yours.',
      story_reframe: 'You made the thing and noticed it mattered.',
    })
    expect(socket.closed).toBe(true)
  })

  it('repairs a non-json first response once', async () => {
    const socket = new FakeRealtimeSocket([
      'Sure, here is the reading: validation blah.',
      '```json\n{"validation":"v","inferred_meaning":"m","story_reframe":"s"}\n```',
    ])

    await expect(
      runOpenAIRealtimeMirror(
        { studentId: 'demo', transcript: 'unclear words' },
        {
          config: {
            apiKey: 'sk-test',
            model: 'gpt-realtime',
            callsUrl: 'https://api.openai.test/v1/realtime/calls',
          },
          connect: vi.fn(async () => socket),
        },
      ),
    ).resolves.toEqual({
      validation: 'v',
      inferred_meaning: 'm',
      story_reframe: 's',
    })
    expect(socket.sent.filter((event) => event.type === 'response.create')).toHaveLength(2)
  })

  it('extracts fenced or prose-prefixed JSON', () => {
    expect(
      parseMirrorRealtimeText(
        'Here:\n```json\n{"validation":"v","inferred_meaning":"m","story_reframe":"s"}\n```',
      ),
    ).toEqual({ validation: 'v', inferred_meaning: 'm', story_reframe: 's' })
  })

  it('frames the live Companion as a two-mode reflective journaling listener', () => {
    const instructions = buildRealtimeMirrorLiveInstructions()

    expect(instructions).toContain('reflective journaling companion')
    expect(instructions).toContain('Gathering mode')
    expect(instructions).toContain('Reflecting mode')
    expect(instructions).toContain('If the student is checking whether the mic works')
    expect(instructions).toContain('Never speak JSON')
    expect(instructions).toContain('Always respond in English')
    expect(buildRealtimeMirrorResponseInstructions()).toContain('Write every field in English')
  })
})

class FakeRealtimeSocket implements RealtimeMirrorSocket {
  sent: RealtimeClientEvent[] = []
  closed = false
  private eventHandlers = new Set<(event: RealtimeServerEvent) => void>()
  private errorHandlers = new Set<(error: Error) => void>()

  constructor(private responses: string[]) {}

  on(event: 'event', handler: (event: RealtimeServerEvent) => void): void
  on(event: 'error', handler: (error: Error) => void): void
  on(
    event: 'event' | 'error',
    handler: ((event: RealtimeServerEvent) => void) | ((error: Error) => void),
  ) {
    if (event === 'event') this.eventHandlers.add(handler as (event: RealtimeServerEvent) => void)
    else this.errorHandlers.add(handler as (error: Error) => void)
  }

  off(event: 'event', handler: (event: RealtimeServerEvent) => void): void
  off(event: 'error', handler: (error: Error) => void): void
  off(
    event: 'event' | 'error',
    handler: ((event: RealtimeServerEvent) => void) | ((error: Error) => void),
  ) {
    if (event === 'event')
      this.eventHandlers.delete(handler as (event: RealtimeServerEvent) => void)
    else this.errorHandlers.delete(handler as (error: Error) => void)
  }

  send(event: RealtimeClientEvent) {
    this.sent.push(event)
    if (event.type !== 'response.create') return
    const text = this.responses.shift()
    if (!text) {
      for (const handler of this.errorHandlers) handler(new Error('no fake response queued'))
      return
    }
    queueMicrotask(() => {
      for (const handler of this.eventHandlers) {
        handler({ type: 'response.output_text.done', text } as RealtimeServerEvent)
        handler({ type: 'response.done', response: { status: 'completed' } } as RealtimeServerEvent)
      }
    })
  }

  close() {
    this.closed = true
  }
}
