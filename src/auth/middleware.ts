// Auth middleware adapter — owns the single allowed read of the dev-bypass
// escape hatch (`DEV_BYPASS_AUTH`) and counselor bootstrap helpers.
//
// Why this file exists:
//   1. `DEV_BYPASS_AUTH=demo-a` lets the team run `pnpm dev` without WorkOS
//      env vars during Steps 5-10 of the migration. The env var is read in
//      exactly one place (this file) so a CI lint guard can fail the build
//      if a reference leaks elsewhere. Without that guard, the bypass could
//      drift into production code paths and silently grant access.
//   2. Real WorkOS users get a private empty student namespace. Demo seeded
//      rows are attached only for explicit demo/dev bypass sessions.
//
// Production never sets `DEV_BYPASS_AUTH`. The Vercel env-var list in
// `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md` §10
// does not include it.

import { type DevBypassIdentity, makeBypassIdentity } from './demo'

/**
 * Read the dev-only auth bypass. Returns `null` outside dev.
 *
 * THE ONLY ALLOWED READ of `process.env.DEV_BYPASS_AUTH`. Reference this
 * helper anywhere a request needs to know "are we in bypass mode"; the CI
 * lint guard (`.github/workflows/lint-no-stale-flag.yml`-adjacent) treats
 * any other reference to `DEV_BYPASS_AUTH` as a violation.
 *
 * Production never sets this var; if it somehow lands in a Vercel env, the
 * synthetic counselor still has to satisfy `counselor_students` to query
 * anything (an `auth-bypass:` counselor row would need to exist in prod
 * Postgres, which never happens by accident).
 */
export function getDevBypassAuth(): DevBypassIdentity | null {
  const studentId = process.env.DEV_BYPASS_AUTH
  if (!studentId || studentId.trim().length === 0) return null
  // Synthetic counselor id is namespaced so it cannot collide with a real
  // WorkOS user id (which is always `user_…`). counselor_students rows
  // keyed against this id are inserted lazily on first request below.
  return makeBypassIdentity(studentId.trim())
}

/**
 * True iff the dev-bypass is active. Use in `src/start.ts` to decide
 * whether to register `authkitMiddleware()` — registering it without
 * WorkOS env vars would crash every request.
 */
export function isAuthBypassed(): boolean {
  return getDevBypassAuth() !== null
}

/**
 * Idempotent: insert one `counselor_students` row per demo student for a
 * demo/dev counselor. Called from bypass code paths on first request.
 */
export async function bootstrapDemoStudentsForCounselor(counselorId: string): Promise<void> {
  const { attachCounselorToDemoStudents } = await import('~/db/client')
  await attachCounselorToDemoStudents(counselorId)
}

/**
 * Idempotent: attach a real WorkOS counselor to their private empty student
 * namespace and return that student id.
 */
export async function bootstrapPersonalStudentForCounselor(counselorId: string): Promise<string> {
  const { attachCounselorToPersonalStudent } = await import('~/db/client')
  return attachCounselorToPersonalStudent(counselorId)
}
