/**
 * Soft auth-context resolver for the public `/share/$token` route.
 *
 * Distinct from `requireCounselorContext()` because the public route MUST
 * NOT throw for unauthenticated viewers — parents, teachers, friends are
 * the primary audience. This helper returns the calling student's id if
 * the request happens to carry a WorkOS or demo session, and null
 * otherwise.
 *
 * Used by `loadPublicProfileHandler` solely to compute the boolean
 * `isOwner` flag (drives the OwnerPreviewBanner). The owner's `studentId`
 * never reaches the client; only the comparison result does.
 */

import { getDemoBypassAuthFromCookie } from '~/auth/demo-session.server'
import { getDevBypassAuth } from '~/auth/middleware'
import { hasWorkosEnv } from '~/auth/workos'

export async function tryResolveOwnerStudentId(): Promise<string | null> {
  const bypass = getDevBypassAuth()
  if (bypass) return bypass.activeStudentId

  if (hasWorkosEnv()) {
    const fromWorkos = await tryWorkosStudentId()
    if (fromWorkos) return fromWorkos
  }

  const demoBypass = getDemoBypassAuthFromCookie()
  if (demoBypass) return demoBypass.activeStudentId

  return null
}

async function tryWorkosStudentId(): Promise<string | null> {
  try {
    const { getAuth } = await import('@workos/authkit-tanstack-react-start')
    const auth = await getAuth()
    if (!auth.user) return null
    const { personalStudentIdForCounselor } = await import('~/db/client')
    return personalStudentIdForCounselor(auth.user.id)
  } catch (err) {
    // The public route has no AuthKit middleware guarantee. Any failure
    // path is treated as "not signed in" — the banner just won't render.
    if (err instanceof Error && err.message.includes('AuthKit middleware is not configured')) {
      return null
    }
    return null
  }
}
