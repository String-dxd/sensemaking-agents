/**
 * Vitest global setup.
 *
 * ## The Lane B database gate
 *
 * The DB-backed integration suites (`test/db.test.ts`, `test/db/*rls*`,
 * `test/agents/memory.test.ts`) gate on **`TEST_DATABASE_URL`**, never on
 * `DATABASE_URL`. That distinction is load-bearing, not cosmetic.
 *
 * `DATABASE_URL` is the *application's* variable. It lives in every
 * developer's `.env` and points at whatever database that developer's app
 * talks to — frequently a shared or hosted one. If the suites keyed off it,
 * then merely having a normal `.env` would silently arm them, and
 * `pnpm test` would read and write a real database as a side effect of
 * running the unit tests. An earlier revision of plan 059 loaded
 * `dotenv/config` here and did exactly that; it was caught in review only
 * because the reviewer's machine had a populated `.env` and the CI-shaped
 * machine that wrote it did not.
 *
 * So this file does two things, and deliberately does not load `.env`:
 *
 *  1. If `TEST_DATABASE_URL` is set, the caller is explicitly opting in to
 *     the DB lane. Mirror it onto `DATABASE_URL` so `src/db/client.ts`
 *     (which reads `DATABASE_URL` when it lazily builds its pool) connects
 *     to the *test* database.
 *  2. Otherwise, actively **delete** any ambient `DATABASE_URL` from the
 *     test process. Belt-and-braces behind the `skipIf` gates: if a DB-
 *     touching test ever escapes its gate, it now fails loudly with
 *     "DATABASE_URL is not set" instead of quietly connecting to
 *     production.
 *
 * `TEST_DATABASE_URL` must point at a **disposable local** database. The
 * suites truncate and re-seed, and `test/db/*rls*` is only meaningful when
 * the connecting role does **not** own the tables (see the
 * "FORCE ROW LEVEL SECURITY (deferred)" section of
 * `src/db/migrations/README.md`). Never point it at a shared or production
 * database.
 *
 * Not loading `.env` also keeps `MANAGED_AGENT_*` out of the test process,
 * so the agent suites cannot dispatch a real managed-agent run.
 */
import '@testing-library/jest-dom/vitest'

// Runs before the test module graph is imported, and `src/db/client.ts`
// reads `DATABASE_URL` lazily when it first builds its pool — so mutating
// it here is early enough to decide what any test can reach.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
} else {
  delete process.env.DATABASE_URL
}
