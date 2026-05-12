import OpenAI, { toFile } from 'openai'
import { z } from 'zod'

/**
 * Browser-side reflection capture posts the recorded audio (encoded as
 * base64) plus its MIME type. Server decodes, hands off to OpenAI Whisper,
 * returns the transcript. The audio blob is held only for the duration of
 * the transcription call and is not persisted (transcripts-only policy).
 *
 * 25 MB is the documented Whisper upload limit; we reject earlier to keep
 * a clear error rather than hitting an opaque OpenAI 413.
 */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export const transcribeMirrorInputSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
})

export type TranscribeMirrorInput = z.output<typeof transcribeMirrorInputSchema>

export interface TranscribeMirrorResult {
  transcript: string
  durationMs: number
}

export class WhisperTranscriptionError extends Error {
  constructor(
    message: string,
    readonly code: 'EMPTY_AUDIO' | 'TOO_LARGE' | 'NO_API_KEY' | 'UPSTREAM',
    readonly upstreamStatus?: number,
  ) {
    super(message)
    this.name = 'WhisperTranscriptionError'
  }
}

export interface TranscribeMirrorDeps {
  /** Override the OpenAI client. Default: a real client constructed from env. */
  client?: { audio: { transcriptions: { create: OpenAI['audio']['transcriptions']['create'] } } }
}

export async function transcribeMirrorHandler(
  data: TranscribeMirrorInput,
  deps: TranscribeMirrorDeps = {},
): Promise<TranscribeMirrorResult> {
  const parsed = transcribeMirrorInputSchema.parse(data)

  let buffer: Buffer
  try {
    buffer = Buffer.from(parsed.audioBase64, 'base64')
  } catch {
    throw new WhisperTranscriptionError('Audio is not valid base64.', 'UPSTREAM')
  }
  if (buffer.length === 0) {
    throw new WhisperTranscriptionError('Audio blob is empty.', 'EMPTY_AUDIO')
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new WhisperTranscriptionError(
      `Audio blob is ${buffer.length} bytes — over the 25 MB Whisper limit.`,
      'TOO_LARGE',
    )
  }

  const client = deps.client ?? makeOpenAiClient()
  const filename = filenameForMime(parsed.mimeType)
  const start = Date.now()
  try {
    const file = await toFile(buffer, filename, { type: parsed.mimeType })
    // gpt-4o-mini-transcribe replaces whisper-1: same call shape, same
    // language hint, materially better on accented English (the failure
    // mode whisper-1 hit on SG/Indonesian/Malay-accented English in
    // local testing). Drops verbose_json + timestamps support, which we
    // don't use. See OpenAI's speech-to-text guide.
    const result = await client.audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
      language: 'en',
    })
    return {
      transcript: result.text,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
        ? err.status
        : undefined
    throw new WhisperTranscriptionError(
      `Whisper transcription failed: ${message}`,
      'UPSTREAM',
      status,
    )
  }
}

function makeOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new WhisperTranscriptionError('OPENAI_API_KEY not set on the server.', 'NO_API_KEY')
  }
  return new OpenAI({ apiKey })
}

function filenameForMime(mime: string): string {
  // Whisper inspects the filename extension as a hint about the format.
  if (mime.includes('webm')) return 'mirror-session.webm'
  if (mime.includes('mp4')) return 'mirror-session.mp4'
  if (mime.includes('mpeg')) return 'mirror-session.mp3'
  if (mime.includes('wav')) return 'mirror-session.wav'
  if (mime.includes('ogg')) return 'mirror-session.ogg'
  return 'mirror-session.bin'
}
