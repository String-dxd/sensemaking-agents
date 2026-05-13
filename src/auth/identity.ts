// Counselor identity resolver. The single entry point every handler uses
// to learn "who is the calling counselor, and which student are they
// operating on right now."
//
// Two paths:
//   1. DEV_BYPASS_AUTH set, or demo-session cookie present → return a
//      synthetic counselor + activeStudentId, after lazily ensuring the
//      synthetic counselor has `counselor_students` rows for the 4 demo students.
//   2. Otherwise → call `getAuth()` from AuthKit, derive activeStudentId
//      from `counselor_students` (lowest attached studentId for v0.2,
//      since the counselor picker UI is deferred to a follow-up PR per
//      plan §16 "Deferred to follow-up PR"), and verify counselor↔student
//      access via `assertCounselorHasStudent`.
//
// Handlers never read the dev-bypass env var or call `getAuth()`
// directly. They call `requireCounselorContext()`. This is the seam that
// makes the activeStudentId server-resolved, never client-supplied
// (plan §6.1).

import { getAuth } from '@workos/authkit-tanstack-react-start'

import { hasWorkosEnv } from '~/auth/workos'
import { assertCounselorHasStudent, findFirstAttachedStudent } from '~/db/client'
import { getDemoBypassAuthFromCookie } from './demo-session.server'
import { bootstrapDemoStudentsForCounselor, getDevBypassAuth } from './middleware'

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not authenticated. Sign in via /api/auth/sign-in.')
    this.name = 'UnauthenticatedError'
  }
}

export class NoStudentAttachedError extends Error {
  readonly counselorId: string
  constructor(counselorId: string) {
    super(
      `Counselor ${counselorId} has no attached students. ` +
        'First sign-in should have attached demo-a..d via the WorkOS callback hook.',
    )
    this.name = 'NoStudentAttachedError'
    this.counselorId = counselorId
  }
}

export interface CounselorContext {
  counselorId: string
  /**
   * Server-resolved active student. v0.2 returns the lowest-attached
   * studentId for the counselor (deterministic); the counselor picker UI
   * is a follow-up PR.
   */
  studentId: string
}

/**
 * Resolve the calling counselor's identity. Throws if not authenticated
 * or if the counselor has no attached students.
 *
 * Side effect under the bypass path: the synthetic counselor's
 * `counselor_students` rows are created on first call.
 */
export async function requireCounselorContext(): Promise<CounselorContext> {
  const bypass = getDevBypassAuth()
  if (bypass) {
    await bootstrapDemoStudentsForCounselor(bypass.counselorId)
    return {
      counselorId: bypass.counselorId,
      studentId: bypass.activeStudentId,
    }
  }

  const workosConfigured = hasWorkosEnv()
  if (workosConfigured) {
    const workosContext = await getWorkosCounselorContext()
    if (workosContext) return workosContext
  }

  const demoBypass = getDemoBypassAuthFromCookie()
  if (demoBypass) {
    await bootstrapDemoStudentsForCounselor(demoBypass.counselorId)
    return {
      counselorId: demoBypass.counselorId,
      studentId: demoBypass.activeStudentId,
    }
  }

  throw new UnauthenticatedError()
}

async function getWorkosCounselorContext(): Promise<CounselorContext | null> {
  let auth: Awaited<ReturnType<typeof getAuth>>
  try {
    auth = await getAuth()
  } catch (err) {
    if (isAuthKitMiddlewareMissingError(err)) {
      return null
    }
    throw err
  }
  if (!auth.user) return null

  const counselorId = auth.user.id
  const studentId = await findFirstAttachedStudent(counselorId)
  if (!studentId) throw new NoStudentAttachedError(counselorId)

  // Defensive — findFirstAttachedStudent already queries counselor_students,
  // but `assertCounselorHasStudent` is the canonical gate before any
  // `withStudent(studentId, …)` query path is opened. Keeping both makes
  // it harder for a future refactor to bypass the access check.
  await assertCounselorHasStudent(counselorId, studentId)

  return { counselorId, studentId }
}

function isAuthKitMiddlewareMissingError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('AuthKit middleware is not configured')
}
