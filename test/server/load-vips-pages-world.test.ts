import { describe, expect, it } from 'vitest'
import type { MirrorEntryRow } from '~/db/queries'
import { loadStudentSpaceShellData } from '~/lib/student-space/demo-shell-data.server'
import { deriveRecentMoodsFromMirrorEntries } from '~/server/load-vips-pages.handler.server'

function mirrorEntry(overrides: Partial<MirrorEntryRow>): MirrorEntryRow {
  return {
    id: 1,
    student_id: 'demo',
    transcript: 't',
    validation: 'v',
    inferred_meaning: 'm',
    story_reframe: 's',
    raw_output_json: '{}',
    context_type: 'school',
    review_status: 'pending',
    tags: [],
    created_at: '2026-05-14T00:00:00.000Z',
    ...overrides,
  }
}

describe('loadVipsPages world data helpers', () => {
  it('derives recent mood pins from persisted mirror mood tags', () => {
    const moods = deriveRecentMoodsFromMirrorEntries([
      mirrorEntry({
        id: 10,
        tags: ['mood:joy'],
        created_at: '2026-05-14T10:00:00.000Z',
      }),
      mirrorEntry({
        id: 9,
        tags: ['mood:curious'],
        created_at: '2026-05-14T09:00:00.000Z',
      }),
      mirrorEntry({
        id: 8,
        tags: ['topic:peer', 'mood:sadness'],
        created_at: '2026-05-14T08:00:00.000Z',
      }),
    ])

    expect(moods).toEqual([
      {
        id: 10,
        emotion: 'joy',
        intensity: 0.72,
        created_at: '2026-05-14T10:00:00.000Z',
      },
      {
        id: 8,
        emotion: 'sadness',
        intensity: 0.72,
        created_at: '2026-05-14T08:00:00.000Z',
      },
    ])
  })

  it('bounds recent mood descriptors for the world scene', () => {
    const entries = [
      mirrorEntry({ id: 1, tags: ['mood:joy'] }),
      mirrorEntry({ id: 2, tags: ['mood:sadness'] }),
      mirrorEntry({ id: 3, tags: ['mood:anger'] }),
    ]

    expect(deriveRecentMoodsFromMirrorEntries(entries, 2).map((mood) => mood.id)).toEqual([1, 2])
  })

  it('resolves deterministic shell data from the centralized demo corpus', () => {
    const demoA = loadStudentSpaceShellData('demo-a')
    const demoB = loadStudentSpaceShellData('demo-b')

    expect(demoA?.identity).toMatchObject({ name: 'Alice', className: 'Sec 4' })
    expect(demoA?.calendarEvents.map((event) => event.date)).toContain('2026-07-19')
    // Letters now come from the engine seed only; the shell contributes none.
    expect(demoA?.teacherLetters).toEqual([])
    expect(demoB?.identity.name).not.toBe(demoA?.identity.name)
    expect(loadStudentSpaceShellData('private-student')).toBeNull()
  })
})
