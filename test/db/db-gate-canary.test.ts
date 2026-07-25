/**
 * Loudness guard for the DATABASE_URL test gate.
 *
 * Fifteen test files gate whole describes on
 * `describe.skipIf(!process.env.DATABASE_URL)`. When that variable is unset
 * the suite still reports "0 failed", which is how 127 tests stayed dark for
 * months (plans/059). This canary makes the state visible, and lets any
 * caller *demand* the DB lane by exporting REQUIRE_DB_TESTS=1.
 *
 * Deliberately NOT keyed on `CI` alone: plan 043's CI workflow runs without
 * DATABASE_URL on purpose, so an unconditional CI failure would break it.
 */
import { describe, expect, it } from 'vitest'

const hasDb = Boolean(process.env.DATABASE_URL)

describe('DATABASE_URL test gate', () => {
  it('is either satisfied, or explicitly acknowledged as skipped', () => {
    if (process.env.REQUIRE_DB_TESTS === '1') {
      expect(
        hasDb,
        'REQUIRE_DB_TESTS=1 was set but DATABASE_URL is unset — the DB-gated suites would silently skip.',
      ).toBe(true)
      return
    }
    if (!hasDb) {
      console.warn(
        '[db-gate] DATABASE_URL is unset — DB-gated suites are SKIPPED. ' +
          'Set DATABASE_URL (see README "Setup") and re-run, or export REQUIRE_DB_TESTS=1 to make this a hard failure.',
      )
    }
    expect(true).toBe(true)
  })
})
