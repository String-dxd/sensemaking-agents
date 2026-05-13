import { describe, expect, it, vi } from 'vitest'
import type { TenantContext } from '~/db/client'
import type { MirrorEntryRow, VipsTimelineEntryRow } from '~/db/queries'
import { loadWikiEntryHandler } from '~/server/load-wiki.handler.server'

type WithStudentFn = <T>(
  studentId: string,
  fn: (ctx: TenantContext) => Promise<T>,
  opts?: { counselorId?: string },
) => Promise<T>

function mirrorEntry(overrides: Partial<MirrorEntryRow> = {}): MirrorEntryRow {
  return {
    id: 7,
    student_id: 'demo-c',
    transcript: 'i hated when teacher told us exactly what to do',
    validation: 'v',
    inferred_meaning: 'm',
    story_reframe: 's',
    raw_output_json: '{}',
    context_type: 'school',
    review_status: 'pending',
    tags: [],
    created_at: '2026-05-13T00:00:00.000Z',
    ...overrides,
  }
}

function timelineEntry(overrides: Partial<VipsTimelineEntryRow> = {}): VipsTimelineEntryRow {
  return {
    id: 101,
    student_id: 'demo-c',
    dimension: 'values',
    canonical_claim_id: 'values.independence',
    verbatim_quote: 'i hated when teacher told us exactly what to do',
    reflection_id: 7,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-13T00:00:00.000Z',
    ...overrides,
  }
}

describe('loadWikiEntryHandler connected VIPS links', () => {
  it('returns verified VIPS timeline entries connected to the Mirror entry', async () => {
    const ctx = { studentId: 'demo-c' } as TenantContext
    const withStudentMock = vi.fn()
    const withStudent: WithStudentFn = async (studentId, fn) => {
      withStudentMock(studentId, fn)
      return fn(ctx)
    }
    const getMirrorEntry = vi.fn(async () => mirrorEntry())
    const listVipsTimelineEntriesByReflectionId = vi.fn(async () => [
      timelineEntry(),
      timelineEntry({
        id: 102,
        dimension: 'skills',
        canonical_claim_id: 'skills.analytical',
      }),
    ])

    const result = await loadWikiEntryHandler(
      { entryId: 7 },
      {
        requireContext: vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo-c' })),
        withStudent,
        getMirrorEntry,
        listVipsTimelineEntriesByReflectionId,
      },
    )

    expect(result?.entry.id).toBe(7)
    expect(result?.connected_vips_entries).toHaveLength(2)
    expect(withStudentMock).toHaveBeenCalledWith('demo-c', expect.any(Function))
    expect(getMirrorEntry).toHaveBeenCalledWith('demo-c', 7, { ctx })
    expect(listVipsTimelineEntriesByReflectionId).toHaveBeenCalledWith('demo-c', 7, { ctx })
  })

  it('returns null for an unknown Mirror entry without loading connected links', async () => {
    const listVipsTimelineEntriesByReflectionId = vi.fn()
    const withStudent: WithStudentFn = async (_studentId, fn) =>
      fn({ studentId: 'demo-c' } as TenantContext)
    const result = await loadWikiEntryHandler(
      { entryId: 999 },
      {
        requireContext: vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo-c' })),
        withStudent,
        getMirrorEntry: vi.fn(async () => null),
        listVipsTimelineEntriesByReflectionId,
      },
    )

    expect(result).toBeNull()
    expect(listVipsTimelineEntriesByReflectionId).not.toHaveBeenCalled()
  })
})
