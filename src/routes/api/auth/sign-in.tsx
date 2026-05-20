// WorkOS AuthKit sign-in initiator. The WorkOS dashboard's
// "Sign-in endpoint" must point at this URL so dashboard-initiated flows
// (impersonation, magic-link) route through here first — required for
// the SDK's PKCE/CSRF enforcement.

import { createFileRoute } from '@tanstack/react-router'
import { DEFAULT_DEMO_STUDENT_ID, safeReturnPathname } from '~/auth/demo'
import { isSameOriginRequest } from '~/auth/same-origin'

export const Route = createFileRoute('/api/auth/sign-in')({
  server: {
    handlers: {
      GET: handleSignInGet,
      POST: handleSignInPost,
    },
  },
})

export async function handleSignInGet({ request }: { request: Request }): Promise<Response> {
  const urlParts = new URL(request.url)
  const rawReturnPathname = urlParts.searchParams.get('returnPathname')
  const returnPathname = rawReturnPathname ? safeReturnPathname(rawReturnPathname) : undefined
  if (urlParts.searchParams.get('demo') === '1') {
    return new Response('Demo sign-in requires a same-origin POST.', {
      status: 405,
      headers: { Allow: 'POST' },
    })
  }

  const [{ hasWorkosEnv }, { isAuthBypassed }] = await Promise.all([
    import('~/auth/workos'),
    import('~/auth/middleware'),
  ])
  if (isAuthBypassed()) {
    return redirectTo(returnPathname ?? '/')
  }
  if (!hasWorkosEnv()) {
    return redirectTo('/?authError=workos_unconfigured')
  }

  const { getSignInUrl } = await import('@workos/authkit-tanstack-react-start')
  const url = await getSignInUrl(returnPathname ? { data: { returnPathname } } : undefined)
  return redirectTo(url, 307)
}

export async function handleSignInPost({ request }: { request: Request }): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('Demo sign-in must start from this site.', { status: 403 })
  }

  const urlParts = new URL(request.url)
  const returnPathname = safeReturnPathname(urlParts.searchParams.get('returnPathname'))
  if (urlParts.searchParams.get('demo') !== '1') return redirectTo(returnPathname)

  const [{ demoCookieHeader, getDemoBypassAuthFromCookie }, { normalizeDemoStudentId }] =
    await Promise.all([import('~/auth/demo-session.server'), import('~/auth/demo')])

  // Preserve an existing valid demo selection so a second click on
  // "Use a demo account" (or any flow that POSTs here) does not silently
  // reset the active student to demo-a and orphan whatever data was
  // captured against another demo id. If the cookie is missing or carries
  // an unrecognised value, fall back to the default.
  const existing = getDemoBypassAuthFromCookie()
  const studentId = normalizeDemoStudentId(existing?.activeStudentId) ?? DEFAULT_DEMO_STUDENT_ID
  return redirectTo(returnPathname, 303, {
    'Set-Cookie': demoCookieHeader(studentId),
  })
}

function redirectTo(location: string, status = 303, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Location', location)
  return new Response(null, {
    status,
    headers: responseHeaders,
  })
}
