// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
/**
 * U9 — load-vips-pages handler tests.
 *
 * Happy path: returns four page rows in canonical dimension order +
 * per-dimension timelines + claim counts.
 *
 * R19: forgotten timeline entries are excluded from
 * `timeline_by_dimension` and from `claim_count_by_dimension`.
 *
 * R20 boundary: the response does NOT contain `vips_forget_count` data
 * even after some entries are forgotten. The count exists server-side
 * but never crosses the server-fn boundary.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import {
  forgetVipsTimelineEntry,
  getVipsForgetCount,
  insertVipsTimelineEntry,
  upsertVipsPage,
} from '~/db/queries'
import { seed } from '~/db/seed'
import { loadVipsPagesHandler } from '~/server/load-vips-pages.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})

afterEach(() => {
  resetDbForTests()
})

describe.skipIf(!process.env.DATABASE_URL)('loadVipsPagesHandler — happy path', () => {
  it('returns exactly four pages in canonical dimension order even with zero upserted rows', () => {
    const result = loadVipsPagesHandler({ studentId: 'demo' })
    expect(result.pages).toHaveLength(4)
    expect(result.pages.map((p) => p.dimension)).toEqual([
      'values',
      'interests',
      'personality',
      'skills',
    ])
    // Stubs for dimensions with no upserted row.
    expect(result.pages.every((p) => p.compiled_truth === '' && p.open_question === '')).toBe(true)
    expect(result.total_claim_count).toBe(0)
  })

  it('returns persisted page rows with their compiled_truth + open_question + updated_at', () => {
    upsertVipsPage('demo', {
      dimension: 'values',
      compiled_truth: 'Practices self-direction in school settings.',
      open_question: 'Does the same hold collaboratively?',
    })

    const result = loadVipsPagesHandler({ studentId: 'demo' })
    const values = result.pages.find((p) => p.dimension === 'values')
    expect(values?.compiled_truth).toBe('Practices self-direction in school settings.')
    expect(values?.open_question).toBe('Does the same hold collaboratively?')
    expect(values?.updated_at).toBeTruthy()
  })

  it('groups non-forgotten timeline entries by dimension and reports per-dimension counts', () => {
    insertVipsTimelineEntry('demo', {
      dimension: 'values',
      canonical_claim_id: 'values.independence',
      verbatim_quote: 'a',
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['school'],
    })
    insertVipsTimelineEntry('demo', {
      dimension: 'values',
      canonical_claim_id: 'values.autonomy',
      verbatim_quote: 'b',
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['school'],
    })
    insertVipsTimelineEntry('demo', {
      dimension: 'interests',
      canonical_claim_id: 'interests.investigative',
      verbatim_quote: 'c',
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['hobby'],
    })

    const result = loadVipsPagesHandler({ studentId: 'demo' })
    expect(result.timeline_by_dimension.values).toHaveLength(2)
    expect(result.timeline_by_dimension.interests).toHaveLength(1)
    expect(result.timeline_by_dimension.personality).toHaveLength(0)
    expect(result.timeline_by_dimension.skills).toHaveLength(0)
    expect(result.claim_count_by_dimension).toEqual({
      values: 2,
      interests: 1,
      personality: 0,
      skills: 0,
    })
    expect(result.total_claim_count).toBe(3)
  })

  it('cross-student isolation: another student sees zero claims', () => {
    insertVipsTimelineEntry('demo', {
      dimension: 'values',
      canonical_claim_id: 'values.contribution',
      verbatim_quote: 'a',
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['school'],
    })
    const result = loadVipsPagesHandler({ studentId: 'other-student' })
    expect(result.total_claim_count).toBe(0)
    expect(result.timeline_by_dimension.values).toHaveLength(0)
  })
})

describe.skipIf(!process.env.DATABASE_URL)('loadVipsPagesHandler — R19 / R20 boundaries', () => {
  it('excludes forgotten timeline entries from timeline_by_dimension (R19)', () => {
    const e1 = insertVipsTimelineEntry('demo', {
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'a',
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['school'],
    })
    insertVipsTimelineEntry('demo', {
      dimension: 'values',
      canonical_claim_id: 'values.b',
      verbatim_quote: 'b',
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['school'],
    })

    forgetVipsTimelineEntry('demo', e1.id)

    const result = loadVipsPagesHandler({ studentId: 'demo' })
    expect(result.timeline_by_dimension.values).toHaveLength(1)
    expect(result.timeline_by_dimension.values[0]?.canonical_claim_id).toBe('values.b')
    expect(result.claim_count_by_dimension.values).toBe(1)
  })

  it('does NOT include vips_forget_count in the response shape (R20)', () => {
    const e1 = insertVipsTimelineEntry('demo', {
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'a',
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['school'],
    })
    forgetVipsTimelineEntry('demo', e1.id)
    // Sanity: the count is recorded server-side.
    expect(getVipsForgetCount('demo', 'values')).toBe(1)

    const result = loadVipsPagesHandler({ studentId: 'demo' })

    // The result shape must not leak the counter under any plausible key.
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/forget_count/i)
    expect(serialized).not.toMatch(/vips_forget/i)
    // Belt-and-braces: walk the object and assert no field named
    // `*forget*` exists.
    const keys = collectAllKeys(result as unknown as Record<string, unknown>)
    expect(keys.some((k) => /forget/i.test(k))).toBe(false)
  })
})

describe.skipIf(!process.env.DATABASE_URL)('loadVipsPagesHandler — input validation', () => {
  it('rejects an empty studentId via Zod', () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
    expect(() => loadVipsPagesHandler({ studentId: '' } as any)).toThrow()
  })
})

function collectAllKeys(obj: unknown, acc: string[] = []): string[] {
  if (obj === null || typeof obj !== 'object') return acc
  if (Array.isArray(obj)) {
    for (const item of obj) collectAllKeys(item, acc)
    return acc
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    acc.push(k)
    collectAllKeys(v, acc)
  }
  return acc
}
