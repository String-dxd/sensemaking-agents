/**
 * Loudness guard for the Lane B database test gate.
 *
 * Several suites gate whole describes on
 * `describe.skipIf(!process.env.TEST_DATABASE_URL)`. When that variable is
 * unset the suite still reports "0 failed", which is how 127 tests stayed
 * dark for months (plans/059). This canary makes the state visible, and
 * lets any caller *demand* the DB lane by exporting REQUIRE_DB_TESTS=1.
 *
 * ## Why `TEST_DATABASE_URL` and not `DATABASE_URL`
 *
 * `DATABASE_URL` is the application's variable and sits in most developers'
 * `.env`, often pointing at a shared or hosted database. Gating on it means
 * an ordinary `.env` silently arms the DB lane and `pnpm test` mutates a
 * real database as a side effect. `TEST_DATABASE_URL` has no other consumer,
 * so it can only be set deliberately. `test/setup.ts` additionally strips
 * any ambient `DATABASE_URL` from the test process when `TEST_DATABASE_URL`
 * is absent, so an escaped test fails loudly rather than connecting to
 * production.
 *
 * Point `TEST_DATABASE_URL` at a **disposable local** database only — the
 * suites truncate and re-seed, and the RLS suites are only meaningful when
 * the connecting role does not own the tables (see the "FORCE ROW LEVEL
 * SECURITY (deferred)" section of `src/db/migrations/README.md`).
 *
 * Deliberately NOT keyed on `CI` alone: plan 043's CI workflow runs without
 * a database on purpose, so an unconditional CI failure would break it.
 */
import { describe, expect, it } from 'vitest'

const hasDb = Boolean(process.env.TEST_DATABASE_URL)

describe('TEST_DATABASE_URL test gate', () => {
  it('is either satisfied, or explicitly acknowledged as skipped', () => {
    if (process.env.REQUIRE_DB_TESTS === '1') {
      expect(
        hasDb,
        'REQUIRE_DB_TESTS=1 was set but TEST_DATABASE_URL is unset — the DB-gated suites would silently skip.',
      ).toBe(true)
      return
    }
    if (!hasDb) {
      console.warn(
        '[db-gate] TEST_DATABASE_URL is unset — DB-gated suites are SKIPPED. ' +
          'Point TEST_DATABASE_URL at a disposable local Postgres and re-run `pnpm test:db`, ' +
          'or export REQUIRE_DB_TESTS=1 to make this a hard failure.',
      )
    }
    expect(true).toBe(true)
  })

  it('never lets an ambient DATABASE_URL arm the DB lane', () => {
    // The regression this file exists for: `test/setup.ts` must not leave a
    // `DATABASE_URL` in the test process unless the caller explicitly opted
    // in via `TEST_DATABASE_URL`. Without this, merely having a populated
    // `.env` pointed `pnpm test` at a real database.
    if (hasDb) {
      expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL)
    } else {
      expect(process.env.DATABASE_URL).toBeUndefined()
    }
  })
})
