/**
 * Plan 035 — demo seed corpus date shifting.
 *
 * `shiftCorpusDates` is a pure function: no DB, no fetches, only an
 * optional `now` override. These tests exercise the guarantees from the
 * plan:
 *   - the shifted demo-a max `created_at` lands on "yesterday" (UTC date)
 *     relative to the given `now`
 *   - sort order of all `created_at` values is preserved
 *   - every reflection shifts by the same whole-day delta
 *   - `vips_timeline_entries[].committed_at` shifts by the same delta;
 *     entries without `committed_at` stay absent
 *   - time-of-day is preserved
 *   - `loadSeedCorpus({ shiftDates: false })` returns the verbatim fixture
 *   - `shiftCorpusDates` does not mutate its input
 */
import { describe, expect, it } from 'vitest'
import { loadSeedCorpus, type MultiStudentSeedCorpus, shiftCorpusDates } from '~/db/seed'

const NOW = new Date('2026-07-23T10:00:00Z')

function allCreatedAt(corpus: MultiStudentSeedCorpus): string[] {
  return corpus.students.flatMap((student) => student.reflections.map((r) => r.created_at))
}

function findStudent(corpus: MultiStudentSeedCorpus, studentId: string) {
  const student = corpus.students.find((s) => s.student_id === studentId)
  if (!student) throw new Error(`fixture missing student ${studentId}`)
  return student
}

describe('shiftCorpusDates', () => {
  it('lands the shifted demo-a max created_at on "yesterday" (UTC date)', () => {
    const original = loadSeedCorpus({ shiftDates: false })
    const shifted = shiftCorpusDates(original, NOW)

    const demoA = findStudent(shifted, 'demo-a')
    const sortedDates = demoA.reflections.map((r) => r.created_at).sort()
    const maxCreatedAt = sortedDates[sortedDates.length - 1]
    expect(maxCreatedAt?.slice(0, 10)).toBe('2026-07-22')
  })

  it('preserves the sort order of all created_at values across all students', () => {
    const original = loadSeedCorpus({ shiftDates: false })
    const shifted = shiftCorpusDates(original, NOW)

    const originalSorted = [...allCreatedAt(original)].sort()
    const shiftedSorted = [...allCreatedAt(shifted)].sort()

    // Same relative order means: sorting the shifted list should recover the
    // same permutation as sorting the original list (index-for-index).
    const originalIndexed = allCreatedAt(original).map((date, i) => ({ date, i }))
    const shiftedIndexed = allCreatedAt(shifted).map((date, i) => ({ date, i }))
    originalIndexed.sort((a, b) => a.date.localeCompare(b.date))
    shiftedIndexed.sort((a, b) => a.date.localeCompare(b.date))

    expect(shiftedIndexed.map((entry) => entry.i)).toEqual(originalIndexed.map((entry) => entry.i))
    expect(shiftedSorted.length).toBe(originalSorted.length)
  })

  it('shifts every reflection created_at by the same whole-day delta', () => {
    const original = loadSeedCorpus({ shiftDates: false })
    const shifted = shiftCorpusDates(original, NOW)

    const deltas = new Set<number>()
    for (let s = 0; s < original.students.length; s++) {
      const origStudent = original.students[s]
      const shiftedStudent = shifted.students[s]
      if (!origStudent || !shiftedStudent) throw new Error('student index mismatch')
      for (let r = 0; r < origStudent.reflections.length; r++) {
        const origReflection = origStudent.reflections[r]
        const shiftedReflection = shiftedStudent.reflections[r]
        if (!origReflection || !shiftedReflection) throw new Error('reflection index mismatch')
        const origMs = new Date(origReflection.created_at).getTime()
        const shiftedMs = new Date(shiftedReflection.created_at).getTime()
        deltas.add(shiftedMs - origMs)
      }
    }

    expect(deltas.size).toBe(1)
    const delta = Array.from(deltas)[0]
    expect(delta).toBeDefined()
    expect(Math.abs((delta as number) % 86_400_000)).toBe(0)
  })

  it('shifts demo-a vips_timeline_entries committed_at by the same delta; absent stays absent', () => {
    const original = loadSeedCorpus({ shiftDates: false })
    const shifted = shiftCorpusDates(original, NOW)

    const origDemoA = findStudent(original, 'demo-a')
    const shiftedDemoA = findStudent(shifted, 'demo-a')
    const origTimeline = origDemoA.vips_timeline_entries ?? []
    const shiftedTimeline = shiftedDemoA.vips_timeline_entries ?? []
    expect(origTimeline.length).toBeGreaterThan(0)
    expect(shiftedTimeline.length).toBe(origTimeline.length)

    const origFirstReflection = origDemoA.reflections[0]
    const shiftedFirstReflection = shiftedDemoA.reflections[0]
    if (!origFirstReflection || !shiftedFirstReflection)
      throw new Error('demo-a has no reflections')
    const refDelta =
      new Date(shiftedFirstReflection.created_at).getTime() -
      new Date(origFirstReflection.created_at).getTime()

    for (let i = 0; i < origTimeline.length; i++) {
      const orig = origTimeline[i]
      const shift = shiftedTimeline[i]
      if (!orig || !shift) throw new Error('timeline index mismatch')
      if (orig.committed_at === undefined) {
        expect(shift.committed_at).toBeUndefined()
      } else {
        expect(shift.committed_at).toBeDefined()
        const shiftedMs = new Date(shift.committed_at ?? '').getTime()
        const origMs = new Date(orig.committed_at).getTime()
        expect(shiftedMs - origMs).toBe(refDelta)
      }
    }

    // demo-b has no vips_timeline_entries in the fixture; confirm that stays true.
    const origDemoB = findStudent(original, 'demo-b')
    const shiftedDemoB = findStudent(shifted, 'demo-b')
    expect(shiftedDemoB.vips_timeline_entries ?? []).toEqual(origDemoB.vips_timeline_entries ?? [])
  })

  it('preserves time-of-day: an entry at T01:30:00Z still ends at T01:30:00Z', () => {
    const original = loadSeedCorpus({ shiftDates: false })
    const shifted = shiftCorpusDates(original, NOW)

    const demoA = findStudent(original, 'demo-a')
    const idx = demoA.reflections.findIndex((r) => r.created_at === '2026-07-19T01:30:00Z')
    expect(idx).toBeGreaterThanOrEqual(0)

    const shiftedDemoA = findStudent(shifted, 'demo-a')
    const shiftedReflection = shiftedDemoA.reflections[idx]
    expect(shiftedReflection?.created_at.slice(11)).toBe('01:30:00.000Z')
  })

  it('loadSeedCorpus({ shiftDates: false }) returns the verbatim fixture', () => {
    const original = loadSeedCorpus({ shiftDates: false })
    const demoA = findStudent(original, 'demo-a')
    expect(demoA.reflections.some((r) => r.created_at === '2026-07-19T01:30:00Z')).toBe(true)
  })

  it('does not mutate the input corpus', () => {
    const original = loadSeedCorpus({ shiftDates: false })
    const snapshot = JSON.parse(JSON.stringify(original))

    shiftCorpusDates(original, NOW)

    expect(original).toEqual(snapshot)
  })
})
