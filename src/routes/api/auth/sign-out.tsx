// Sign-out route. AuthKit's `signOut()` clears the session cookie and
// redirects to WorkOS's logout URL, which then bounces back to '/'.

import { createFileRoute, isRedirect } from '@tanstack/react-router'
import { isSameOriginRequest } from '~/auth/same-origin'

export const Route = createFileRoute('/api/auth/sign-out')({
  server: {
    handlers: {
      GET: handleSignOutGet,
      POST: handleSignOutPost,
    },
  },
})

export async function handleSignOutGet(): Promise<Response> {
  return handleSignOut()
}

export async function handleSignOutPost({ request }: { request: Request }): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('Sign-out must start from this site.', { status: 403 })
  }
  return handleSignOut()
}

async function handleSignOut(): Promise<Response> {
  const { clearDemoCookieHeader } = await import('~/auth/demo-session.server')
  const [{ hasWorkosEnv }, { isAuthBypassed }] = await Promise.all([
    import('~/auth/workos'),
    import('~/auth/middleware'),
  ])
  if (isAuthBypassed() || !hasWorkosEnv()) {
    return redirectWithClearedDemoCookie('/', clearDemoCookieHeader())
  }

  const { signOut } = await import('@workos/authkit-tanstack-react-start')
  try {
    await signOut({ data: { returnTo: '/' } })
  } catch (err) {
    if (isRedirect(err) || err instanceof Response) {
      return withClearedDemoCookie(err, clearDemoCookieHeader())
    }
    throw err
  }
  return redirectWithClearedDemoCookie('/', clearDemoCookieHeader())
}

function redirectWithClearedDemoCookie(
  location: string,
  cookieHeader: string,
  status = 303,
): Response {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      'Set-Cookie': cookieHeader,
    },
  })
}

function withClearedDemoCookie(response: Response, cookieHeader: string): Response {
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', cookieHeader)
  if (!headers.has('Location')) {
    headers.set('Location', redirectLocation(response) ?? '/')
  }
  const status = response.status === 307 ? 303 : response.status
  return new Response(response.body, {
    status,
    statusText: status === response.status ? response.statusText : undefined,
    headers,
  })
}

function redirectLocation(response: Response): string | null {
  if (isRedirect(response)) {
    const options = response.options as { href?: string; to?: string }
    return options.href ?? options.to ?? null
  }
  return null
}
