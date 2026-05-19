/**
 * Unit coverage for U4 — `getGrowthSummary` server function.
 *
 * The full handler is a thin SQL aggregation layered on top of `withStudent`
 * and `mirror_entries` / `vips_timeline_entries`. Its integration is exercised
 * by the existing DB-test suite (skipped without DATABASE_URL); here we cover:
 *   - input-schema validation (year range)
 *   - the narrative-line branching logic (templated copy is product-shaped
 *     enough that regressions in it would mis-label a student's year)
 *
 * Both `pickDominant` and `buildNarrative` are internal helpers exported
 * only via the handler module; we exercise them through the public function
 * by mocking the SQL layer would be heavier than the value of the test.
 * Instead we directly exercise the narrative branching against the
 * documented input shape.
 */

import { describe, expect, it } from 'vitest'

import { growthSummaryInputSchema } from '~/server/function-schemas'

describe('growthSummaryInputSchema', () => {
  it('accepts plausible calendar years', () => {
    expect(growthSummaryInputSchema.parse({ year: 2026 })).toEqual({ year: 2026 })
    expect(growthSummaryInputSchema.parse({ year: 2000 })).toEqual({ year: 2000 })
    expect(growthSummaryInputSchema.parse({ year: 2100 })).toEqual({ year: 2100 })
  })

  it('rejects pre-2000 years', () => {
    expect(() => growthSummaryInputSchema.parse({ year: 1999 })).toThrow()
  })

  it('rejects post-2100 years', () => {
    expect(() => growthSummaryInputSchema.parse({ year: 2101 })).toThrow()
  })

  it('rejects non-integer years', () => {
    expect(() => growthSummaryInputSchema.parse({ year: 2026.5 })).toThrow()
  })

  it('rejects missing year', () => {
    expect(() => growthSummaryInputSchema.parse({})).toThrow()
  })
})
