// WorkOS AuthKit OAuth callback. On the first successful sign-in for a
// counselor we idempotently attach them to their private empty student
// namespace; on subsequent sign-ins the attach is a no-op.
//
// The callback URL is `WORKOS_REDIRECT_URI` in env. The WorkOS dashboard
// must list this exact URL under "Redirect URIs".

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      GET: handleCallbackGet,
    },
  },
})

export async function handleCallbackGet(ctx: {
  request: Request
  params?: unknown
  context?: unknown
}): Promise<Response> {
  const [
    { handleCallbackRoute },
    { bootstrapPersonalStudentForCounselor },
    { clearDemoCookieHeader },
  ] = await Promise.all([
    import('@workos/authkit-tanstack-react-start'),
    import('~/auth/middleware'),
    import('~/auth/demo-session.server'),
  ])
  const handler = handleCallbackRoute({
    onSuccess: async ({ user }) => {
      await bootstrapPersonalStudentForCounselor(user.id)
    },
    // On callback failure WorkOS already logs to console; the user
    // lands on `/?authError=auth_failed` so the verifier cookies
    // are still cleared.
    errorRedirectUrl: '/?authError=auth_failed',
  })
  return withClearedDemoCookie(await handler(ctx), clearDemoCookieHeader())
}

function withClearedDemoCookie(response: Response, cookieHeader: string): Response {
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', cookieHeader)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
