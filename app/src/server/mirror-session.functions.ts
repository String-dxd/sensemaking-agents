import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { withStudent } from '~/server/tenancy.server'

/**
 * v0.1 mints a short-lived OpenAI Realtime session token (~1 minute) via the
 * OpenAI sessions endpoint and returns the `client_secret.value` to the
 * browser. The browser then opens a direct WebRTC peer connection to
 * `https://api.openai.com/v1/realtime?model=gpt-realtime-2` using the token.
 *
 * The OpenAI API key never leaves the server.
 *
 * U4 uses a session config without tools; U5 adds the `search_past_mirrors`
 * tool to the same payload.
 */

const MIRROR_MODEL = 'gpt-realtime-2'
const MIRROR_VOICE = 'alloy'
const SESSION_ENDPOINT = 'https://api.openai.com/v1/realtime/sessions'

const inputSchema = z.object({
  studentId: z.string().min(1),
})

export interface MintMirrorSessionResult {
  ephemeralKey: string
  sessionId: string
  expiresAt: string
  model: string
  voice: string
}

export class OpenAIMintError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'OpenAIMintError'
  }
}

/**
 * Pure handler logic — exported for direct unit testing without exercising
 * the TanStack Start RPC wrapper. The server fn below delegates here.
 */
export async function mintMirrorSessionHandler(
  data: z.output<typeof inputSchema>,
): Promise<MintMirrorSessionResult> {
  const parsed = inputSchema.parse(data)
  return withStudent(parsed.studentId, async () => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new OpenAIMintError('OPENAI_API_KEY is not set', 0)
    }

    const sessionConfig = {
      model: MIRROR_MODEL,
      voice: MIRROR_VOICE,
      modalities: ['audio', 'text'],
      turn_detection: { type: 'server_vad' as const },
      // Tools are added by U5.
    }

    const response = await fetch(SESSION_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: JSON.stringify(sessionConfig),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new OpenAIMintError(
        `OpenAI session mint failed: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`,
        response.status,
      )
    }

    const payload = (await response.json()) as {
      id?: string
      client_secret?: { value?: string; expires_at?: number }
      expires_at?: number
      model?: string
      voice?: string
    }
    const ephemeralKey = payload.client_secret?.value
    const sessionId = payload.id
    const expiresAtUnix = payload.client_secret?.expires_at ?? payload.expires_at

    if (!ephemeralKey || !sessionId || !expiresAtUnix) {
      throw new OpenAIMintError(
        'OpenAI session response missing client_secret, id, or expires_at',
        response.status,
      )
    }

    return {
      ephemeralKey,
      sessionId,
      expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
      model: payload.model ?? MIRROR_MODEL,
      voice: payload.voice ?? MIRROR_VOICE,
    }
  })
}

export const mintMirrorSession = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => inputSchema.parse(raw))
  .handler(({ data }) => mintMirrorSessionHandler(data))
