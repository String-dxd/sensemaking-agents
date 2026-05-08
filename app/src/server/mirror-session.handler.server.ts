import { z } from 'zod'
import { withStudent } from '~/server/tenancy.server'

const MIRROR_MODEL = 'gpt-realtime-2'
const MIRROR_VOICE = 'alloy'
// GA endpoint. The legacy beta `/v1/realtime/sessions` does not accept
// gpt-realtime-2 (it's GA-only). The GA endpoint:
//   POST /v1/realtime/client_secrets
//   body: { session: { type: 'realtime', model, audio: { output: { voice } }, ... } }
//   response: { value, expires_at, session: { id, ... } }
// No `OpenAI-Beta` header is required.
const CLIENT_SECRET_ENDPOINT = 'https://api.openai.com/v1/realtime/client_secrets'

export const mintMirrorSessionInputSchema = z.object({
  studentId: z.string().min(1),
})

export type MintMirrorSessionInput = z.output<typeof mintMirrorSessionInputSchema>

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
 * Mints a short-lived ephemeral client_secret (~1 minute) for the OpenAI
 * Realtime GA API. The OpenAI API key never leaves the server. The browser
 * opens a direct WebRTC peer connection to `/v1/realtime/calls?model=...`
 * using only the ephemeral key.
 */
export async function mintMirrorSessionHandler(
  data: MintMirrorSessionInput,
): Promise<MintMirrorSessionResult> {
  const parsed = mintMirrorSessionInputSchema.parse(data)
  return withStudent(parsed.studentId, async () => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new OpenAIMintError('OPENAI_API_KEY is not set', 0)
    }

    const requestBody = {
      session: {
        type: 'realtime' as const,
        model: MIRROR_MODEL,
        audio: {
          input: { format: { type: 'audio/pcm' as const, rate: 24000 } },
          output: { voice: MIRROR_VOICE, format: { type: 'audio/pcm' as const, rate: 24000 } },
        },
        // Mirror's `session.update` event from the browser populates
        // tools + instructions once the data channel opens.
      },
    }

    const response = await fetch(CLIENT_SECRET_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new OpenAIMintError(
        `OpenAI session mint failed: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`,
        response.status,
      )
    }

    const payload = (await response.json()) as {
      value?: string
      expires_at?: number
      session?: { id?: string; model?: string }
    }
    const ephemeralKey = payload.value
    const sessionId = payload.session?.id
    const expiresAtUnix = payload.expires_at

    if (!ephemeralKey || !sessionId || !expiresAtUnix) {
      throw new OpenAIMintError(
        'OpenAI session response missing value, session.id, or expires_at',
        response.status,
      )
    }

    return {
      ephemeralKey,
      sessionId,
      expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
      model: payload.session?.model ?? MIRROR_MODEL,
      voice: MIRROR_VOICE,
    }
  })
}
