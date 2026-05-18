import { describe, expect, it, vi } from 'vitest'
import {
  PrepareStudentSpaceReflectionError,
  prepareStudentSpaceReflectionHandler,
} from '~/server/prepare-student-space-reflection.handler.server'

describe('prepareStudentSpaceReflectionHandler', () => {
  it('runs typed text through Mirror without persisting a mirror entry', async () => {
    const requireContext = vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo' }))
    const runMirror = vi.fn(async () => ({
      output: mirrorOutput(),
      eval_review: null,
    }))
    const transcribeAudio = vi.fn()

    const result = await prepareStudentSpaceReflectionHandler(
      {
        localCaptureId: 'local-typed',
        transcript: 'I wanted the project to help someone.',
        context_type: 'school',
        mood: 'joy',
      },
      { requireContext, runMirror, transcribeAudio },
    )

    expect(requireContext).toHaveBeenCalledOnce()
    expect(transcribeAudio).not.toHaveBeenCalled()
    expect(runMirror).toHaveBeenCalledWith(
      'demo',
      'I wanted the project to help someone.',
      undefined,
    )
    expect(result).toMatchObject({
      local_capture_id: 'local-typed',
      transcript: 'I wanted the project to help someone.',
      context_type: 'school',
      mood: 'joy',
      output: mirrorOutput(),
      transcription: null,
    })
    expect(result).not.toHaveProperty('mirror_entry')
  })

  it('transcribes audio before running Mirror and still does not persist', async () => {
    const transcribeAudio = vi.fn(async () => ({
      transcript: 'voice transcript',
      durationMs: 12,
    }))
    const runMirror = vi.fn(async () => ({
      output: mirrorOutput({ validation: 'I heard the voice version.' }),
      eval_review: null,
    }))

    const result = await prepareStudentSpaceReflectionHandler(
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
      },
    )

    expect(transcribeAudio).toHaveBeenCalledWith(
      { audioBase64: Buffer.from('audio').toString('base64'), mimeType: 'audio/webm' },
      undefined,
    )
    expect(runMirror).toHaveBeenCalledWith('demo', 'voice transcript', undefined)
    expect(result).toMatchObject({
      local_capture_id: 'local-voice',
      transcript: 'voice transcript',
      context_type: 'hobby',
      output: {
        validation: 'I heard the voice version.',
      },
    })
    expect(result).not.toHaveProperty('mirror_entry')
  })

  it('rejects an empty transcription before Mirror runs', async () => {
    const runMirror = vi.fn()

    await expect(
      prepareStudentSpaceReflectionHandler(
        {
          localCaptureId: 'local-empty',
          audioBase64: Buffer.from('audio').toString('base64'),
          mimeType: 'audio/webm',
          context_type: 'school',
        },
        {
          requireContext: vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo' })),
          transcribeAudio: vi.fn(async () => ({ transcript: '', durationMs: 1 })),
          runMirror,
        },
      ),
    ).rejects.toBeInstanceOf(PrepareStudentSpaceReflectionError)

    expect(runMirror).not.toHaveBeenCalled()
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
