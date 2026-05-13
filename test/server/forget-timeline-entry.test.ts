// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
/**
 * U9 — forget-timeline-entry handler tests.
 *
 * Happy path: forgetting a committed timeline entry sets `forgotten_at`,
 * removes the row from `listVipsTimelineEntries`, removes the row from
 * the FTS5 mirror (so hybrid search misses it — R19), and increments
 * `vips_forget_count.count` (R20: recorded, not surfaced).
 *
 * Cross-student isolation: forgetting another student's entry is a
 * no-op (the row stays committed, count unchanged) and surfaces a
 * `ForgetTimelineEntryError` from the handler.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import {
  getVipsForgetCount,
  insertVipsTimelineEntry,
  listVipsTimelineEntries,
  searchVipsTimelineEntries,
} from '~/db/queries'
import { seed } from '~/db/seed'
import { forgetTimelineEntryHandler } from '~/server/forget-timeline-entry.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})

afterEach(() => {
  resetDbForTests()
})

function seedEntry(studentId = 'demo', overrides: Partial<{ verbatim_quote: string }> = {}) {
  return insertVipsTimelineEntry(studentId, {
    dimension: 'values',
    canonical_claim_id: 'values.independence',
    verbatim_quote: overrides.verbatim_quote ?? 'practices self-direction in school',
    reflection_id: null,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
  })
}

describe.skipIf(!process.env.DATABASE_URL)('forgetTimelineEntryHandler — happy path', () => {
  it('stamps forgotten_at and removes the row from listVipsTimelineEntries', () => {
    const entry = seedEntry()
    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(1)

    const result = forgetTimelineEntryHandler({ studentId: 'demo', entryId: entry.id })

    expect(result.dimension).toBe('values')
    expect(result.forgotten_at).toBeTruthy()
    // Default `includeForgotten: false` — the row is gone from the list.
    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(0)
    // But it's preserved as an audit-trail row (`includeForgotten: true`).
    const withForgotten = listVipsTimelineEntries('demo', 'values', { includeForgotten: true })
    expect(withForgotten).toHaveLength(1)
    expect(withForgotten[0]?.forgotten_at).toBeTruthy()
  })

  it('removes the row from the FTS5 mirror so hybrid search misses it (R19)', () => {
    const entry = seedEntry('demo', { verbatim_quote: 'i love mentoring younger students' })
    // Pre-forget: FTS5 mirror contains the row.
    const before = searchVipsTimelineEntries('demo', 'mentoring')
    expect(before.some((r) => r.id === entry.id)).toBe(true)

    forgetTimelineEntryHandler({ studentId: 'demo', entryId: entry.id })

    const after = searchVipsTimelineEntries('demo', 'mentoring')
    expect(after.some((r) => r.id === entry.id)).toBe(false)
  })

  it('increments vips_forget_count.count for the dimension (R20: recorded)', () => {
    const before = getVipsForgetCount('demo', 'values')
    const entry = seedEntry()

    forgetTimelineEntryHandler({ studentId: 'demo', entryId: entry.id })

    expect(getVipsForgetCount('demo', 'values')).toBe(before + 1)
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  'forgetTimelineEntryHandler — cross-student isolation',
  () => {
    it("forgetting another student's entry surfaces an error and is a no-op", () => {
      const entry = seedEntry('demo')

      expect(() =>
        forgetTimelineEntryHandler({ studentId: 'other-student', entryId: entry.id }),
      ).toThrow(/not found/)

      // The demo entry is still present and unforgotten.
      expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(1)
      expect(getVipsForgetCount('demo', 'values')).toBe(0)
    })

    it('rejects an empty studentId via Zod', () => {
      expect(() =>
        // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
        forgetTimelineEntryHandler({ studentId: '', entryId: 1 } as any),
      ).toThrow()
    })

    it('rejects a non-positive entryId via Zod', () => {
      expect(() =>
        // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
        forgetTimelineEntryHandler({ studentId: 'demo', entryId: 0 } as any),
      ).toThrow()
    })
  },
)
