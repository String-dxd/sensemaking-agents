import { describe, expect, it, vi } from 'vitest'
import type { MirrorEntryRow } from '~/db/queries'
import { submitStudentSpaceReflectionHandler } from '~/server/submit-student-space-reflection.handler.server'
import { transcribeMirrorHandler } from '~/server/transcribe-mirror.handler.server'

describe('submitStudentSpaceReflectionHandler', () => {
  it('runs typed text through Mirror and persists the logged entry as confirmed', async () => {
    const requireContext = vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo' }))
    const runMirror = vi.fn(async () => ({
      output: mirrorOutput(),
      eval_review: null,
    }))
    const persistMirror = vi.fn(async () => ({ mirror_entry: mirrorEntry() }))
    const transcribeAudio = vi.fn()

    const result = await submitStudentSpaceReflectionHandler(
      {
        localCaptureId: 'local-1',
        transcript: 'I wanted the project to help someone.',
        context_type: 'school',
        mood: 'joy',
      },
      { requireContext, runMirror, persistMirror, transcribeAudio },
    )

    expect(requireContext).toHaveBeenCalledOnce()
    expect(transcribeAudio).not.toHaveBeenCalled()
    expect(runMirror).toHaveBeenCalledWith(
      'demo',
      'I wanted the project to help someone.',
      undefined,
    )
    expect(persistMirror).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({
        context_type: 'school',
        mood: 'joy',
        review_status: 'confirmed',
        trace: expect.objectContaining({
          source: 'student-space',
          local_capture_id: 'local-1',
        }),
      }),
      undefined,
    )
    expect(result).toMatchObject({
      local_capture_id: 'local-1',
      transcript: 'I wanted the project to help someone.',
      mirror_entry: { id: 42, review_status: 'confirmed' },
      transcription: null,
    })
  })

  it('transcribes audio when no typed transcript is supplied', async () => {
    const transcribeAudio = vi.fn(async () => ({
      transcript: 'voice transcript',
      durationMs: 12,
    }))
    const runMirror = vi.fn(async () => ({
      output: mirrorOutput({ validation: 'I heard the voice version.' }),
      eval_review: null,
    }))

    const result = await submitStudentSpaceReflectionHandler(
      {
        localCaptureId: 'local-voice',
        audioBase64: Buffer.from('audio').toString('base64'),
        mimeType: 'audio/webm',
        context_type: 'hobby',
      },
      {
        requireContext: vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo' })),
        transcribeAudio,
        runMirror,
        persistMirror: vi.fn(async () => ({ mirror_entry: mirrorEntry() })),
      },
    )

    expect(transcribeAudio).toHaveBeenCalledWith(
      { audioBase64: Buffer.from('audio').toString('base64'), mimeType: 'audio/webm' },
      undefined,
    )
    expect(runMirror).toHaveBeenCalledWith('demo', 'voice transcript', undefined)
    expect(result.transcription).toMatchObject({ transcript: 'voice transcript' })
  })

  it('rejects unsupported audio before it reaches transcription', async () => {
    await expect(
      transcribeMirrorHandler(
        {
          audioBase64: Buffer.from('audio').toString('base64'),
          mimeType: 'text/plain',
        },
        { authenticate: vi.fn(async () => ({ counselorId: 'counselor' })) },
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MIME' })
  })
})

function mirrorOutput(
  overrides: Partial<{ validation: string; inferred_meaning: string; story_reframe: string }> = {},
) {
  return {
    validation: 'That sounds like it mattered.',
    inferred_meaning: 'You wanted your work to help someone.',
    story_reframe: 'A moment of contribution taking shape.',
    ...overrides,
  }
}

function mirrorEntry(): MirrorEntryRow {
  return {
    id: 42,
    student_id: 'demo',
    transcript: 'I wanted the project to help someone.',
    validation: 'That sounds like it mattered.',
    inferred_meaning: 'You wanted your work to help someone.',
    story_reframe: 'A moment of contribution taking shape.',
    raw_output_json: '{}',
    context_type: 'school',
    review_status: 'confirmed',
    tags: ['mood:joy'],
    created_at: '2026-05-18T08:00:00.000Z',
  }
}
