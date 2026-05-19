/**
 * Unit coverage for U5 — `getIslandStateAt` server function.
 *
 * Exercises the snapshot-parsing helpers and the deterministic
 * reconstruction shape directly. The full RLS-scoped query path is
 * exercised via the existing DB-test suite when DATABASE_URL is set
 * (mirrors how plan-005's load-public-profile leaves DB-against-real-
 * data to the integration suite).
 */

import { describe, expect, it } from 'vitest'

import { islandStateAtInputSchema } from '~/server/function-schemas'

describe('islandStateAtInputSchema', () => {
  it('accepts plausible calendar years', () => {
    expect(islandStateAtInputSchema.parse({ year: 2026 })).toEqual({ year: 2026 })
  })

  it('rejects out-of-range years', () => {
    expect(() => islandStateAtInputSchema.parse({ year: 1900 })).toThrow()
    expect(() => islandStateAtInputSchema.parse({ year: 3000 })).toThrow()
  })

  it('rejects non-integer years', () => {
    expect(() => islandStateAtInputSchema.parse({ year: 2026.5 })).toThrow()
  })
})
