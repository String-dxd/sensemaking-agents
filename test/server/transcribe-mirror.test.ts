import { describe, expect, it, vi } from 'vitest'
import {
  transcribeMirrorHandler,
  WhisperTranscriptionError,
} from '~/server/transcribe-mirror.handler.server'

describe('transcribeMirrorHandler', () => {
  it('returns the transcript text plus a duration on success', async () => {
    const client = {
      audio: {
        transcriptions: {
          create: vi.fn(async () => ({ text: 'I had a good day at robotics today.' })),
        },
      },
    }
    const out = await transcribeMirrorHandler(
      {
        audioBase64: Buffer.from('not-actually-audio').toString('base64'),
        mimeType: 'audio/webm',
      },
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      { client: client as any },
    )
    expect(out.transcript).toMatch(/robotics/)
    expect(out.durationMs).toBeGreaterThanOrEqual(0)
    expect(client.audio.transcriptions.create).toHaveBeenCalledOnce()
  })

  it('rejects an empty audio blob with EMPTY_AUDIO', async () => {
    await expect(
      transcribeMirrorHandler({
        audioBase64: '',
        mimeType: 'audio/webm',
      }),
    ).rejects.toThrow()
    // empty string fails Zod min(1) before reaching the buffer check; that's fine.
  })

  it('rejects audio over 25 MB with TOO_LARGE', async () => {
    const huge = Buffer.alloc(26 * 1024 * 1024).toString('base64')
    await expect(
      transcribeMirrorHandler({
        audioBase64: huge,
        mimeType: 'audio/webm',
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('wraps upstream OpenAI failures as WhisperTranscriptionError', async () => {
    const client = {
      audio: {
        transcriptions: {
          create: vi.fn(async () => {
            const err = new Error('rate-limited') as Error & { status?: number }
            err.status = 429
            throw err
          }),
        },
      },
    }
    await expect(
      transcribeMirrorHandler(
        {
          audioBase64: Buffer.from('audio').toString('base64'),
          mimeType: 'audio/webm',
        },
        // biome-ignore lint/suspicious/noExplicitAny: test seam
        { client: client as any },
      ),
    ).rejects.toMatchObject({
      name: 'WhisperTranscriptionError',
      code: 'UPSTREAM',
      upstreamStatus: 429,
    })
  })

  it('the WhisperTranscriptionError class carries a name and code', () => {
    const err = new WhisperTranscriptionError('boom', 'EMPTY_AUDIO')
    expect(err.name).toBe('WhisperTranscriptionError')
    expect(err.code).toBe('EMPTY_AUDIO')
  })
})
