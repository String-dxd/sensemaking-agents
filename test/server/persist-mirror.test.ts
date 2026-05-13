import { describe, expect, it, vi } from 'vitest'
import { MEMORY_FILE_PATHS } from '~/agents/memory'
import type { MirrorEntryRow } from '~/db/queries'
import { persistMirrorHandler } from '~/server/persist-mirror.handler.server'

function input() {
  return {
    entry: {
      transcript: 'i hated when teacher told us exactly what to do',
      validation: 'That sounds frustrating.',
      inferred_meaning: 'You wanted more room to decide how to approach the task.',
      story_reframe: 'A moment of wanting independence in school.',
    },
    context_type: 'school' as const,
    raw_output: {},
  }
}

function mirrorEntry(): MirrorEntryRow {
  return {
    id: 42,
    student_id: 'demo',
    transcript: input().entry.transcript,
    validation: input().entry.validation,
    inferred_meaning: input().entry.inferred_meaning,
    story_reframe: input().entry.story_reframe,
    raw_output_json: '{}',
    context_type: 'school',
    review_status: 'pending',
    tags: [],
    created_at: '2026-05-13T00:00:00.000Z',
  }
}

describe('persistMirrorHandler', () => {
  it('persists the Mirror row without invoking Connector during the save round trip', async () => {
    const requireContext = vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo' }))
    const insertMirrorEntry = vi.fn(async () => mirrorEntry())

    const result = await persistMirrorHandler(input(), {
      requireContext,
      insertMirrorEntry,
      appendStudentMemory: vi.fn(async () => ({
        filePath: MEMORY_FILE_PATHS.studentVoice,
        skipped: false,
        opCount: 1,
        snapshotVersion: null,
        memoryId: 'mem_1',
      })),
    })

    expect(result).toEqual({ mirror_entry: mirrorEntry() })
    expect(insertMirrorEntry).toHaveBeenCalledOnce()
    expect(Object.keys(result)).not.toContain('auto_connector_status')
    expect(Object.keys(result)).not.toContain('staged_diff')
  })
})
