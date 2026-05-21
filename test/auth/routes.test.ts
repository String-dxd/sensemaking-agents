// @vitest-environment node

import { redirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bootstrapDemoStudentsForCounselor: vi.fn(),
  bootstrapPersonalStudentForCounselor: vi.fn(),
  getCookie: vi.fn<(name: string) => string | undefined>(() => undefined),
  getSignInUrl: vi.fn(),
  handleCallbackRoute: vi.fn(),
  hasWorkosEnv: vi.fn(),
  isAuthBypassed: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: mocks.getCookie,
}))

vi.mock('~/auth/workos', () => ({
  hasWorkosEnv: mocks.hasWorkosEnv,
}))

vi.mock('~/auth/middleware', () => ({
  bootstrapDemoStudentsForCounselor: mocks.bootstrapDemoStudentsForCounselor,
  bootstrapPersonalStudentForCounselor: mocks.bootstrapPersonalStudentForCounselor,
  isAuthBypassed: mocks.isAuthBypassed,
}))

vi.mock('@workos/authkit-tanstack-react-start', () => ({
  getSignInUrl: mocks.getSignInUrl,
  handleCallbackRoute: mocks.handleCallbackRoute,
  signOut: mocks.signOut,
}))

const [
  { handleSignInGet, handleSignInPost },
  { handleSignOutGet, handleSignOutPost },
  { handleCallbackGet },
] = await Promise.all([
  import('~/routes/api/auth/sign-in.tsx'),
  import('~/routes/api/auth/sign-out.tsx'),
  import('~/routes/api/auth/callback.tsx'),
])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasWorkosEnv.mockReturnValue(true)
  mocks.isAuthBypassed.mockReturnValue(false)
  mocks.getCookie.mockReturnValue(undefined)
})

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, init)
}

describe('/api/auth/sign-in', () => {
  it('does not set the demo cookie from a bare GET', async () => {
    const response = await handleSignInGet({
      request: request('/api/auth/sign-in?demo=1&returnPathname=/reflect'),
    })

    expect(response.status).toBe(405)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(mocks.getSignInUrl).not.toHaveBeenCalled()
  })

  it('sets the demo cookie only from a same-origin POST', async () => {
    const response = await handleSignInPost({
      request: request('/api/auth/sign-in?demo=1&returnPathname=/reflect', {
        method: 'POST',
        headers: { Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' },
      }),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/reflect')
    expect(response.headers.get('Set-Cookie')).toBe(
      'sensemaking-demo-student=demo-a; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax',
    )
  })

  it('rejects cross-site demo POSTs', async () => {
    const response = await handleSignInPost({
      request: request('/api/auth/sign-in?demo=1&returnPathname=/reflect', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
      }),
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('rejects POSTs that send neither Origin nor Sec-Fetch-Site', async () => {
    // curl-style requests cannot positively prove same-origin; refuse them so
    // tools that strip fetch metadata cannot drive demo sign-in.
    const response = await handleSignInPost({
      request: request('/api/auth/sign-in?demo=1', { method: 'POST' }),
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('preserves an existing valid demo cookie instead of resetting to demo-a', async () => {
    mocks.getCookie.mockImplementation((name) =>
      name === 'sensemaking-demo-student' ? 'demo-c' : undefined,
    )

    const response = await handleSignInPost({
      request: request('/api/auth/sign-in?demo=1&returnPathname=/reflect', {
        method: 'POST',
        headers: { Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' },
      }),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('Set-Cookie')).toBe(
      'sensemaking-demo-student=demo-c; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax',
    )
  })

  it('falls back to demo-a when the existing cookie is unrecognised', async () => {
    mocks.getCookie.mockImplementation((name) =>
      name === 'sensemaking-demo-student' ? 'demo-z' : undefined,
    )

    const response = await handleSignInPost({
      request: request('/api/auth/sign-in?demo=1', {
        method: 'POST',
        headers: { Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' },
      }),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('Set-Cookie')).toBe(
      'sensemaking-demo-student=demo-a; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax',
    )
  })

  it('preserves absent WorkOS returnPathname instead of forcing home', async () => {
    mocks.getSignInUrl.mockResolvedValue('https://workos.example/auth')

    const response = await handleSignInGet({
      request: request('/api/auth/sign-in'),
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('https://workos.example/auth')
    expect(mocks.getSignInUrl).toHaveBeenCalledWith(undefined)
  })

  it('returns dev-bypass sign-ins to home by default', async () => {
    mocks.isAuthBypassed.mockReturnValue(true)

    const response = await handleSignInGet({
      request: request('/api/auth/sign-in'),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/')
  })
})

describe('/api/auth/sign-out', () => {
  it('clears local demo auth without calling WorkOS when dev bypass is active', async () => {
    mocks.isAuthBypassed.mockReturnValue(true)

    const response = await handleSignOutGet()

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/')
    expect(response.headers.get('Set-Cookie')).toBe(
      'sensemaking-demo-student=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    )
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('clears demo auth when WorkOS sign-out redirects without an active WorkOS session', async () => {
    mocks.signOut.mockImplementation(() => {
      throw redirect({ to: '/', search: { authError: undefined }, throw: true })
    })

    const response = await handleSignOutGet()

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/')
    expect(response.headers.get('Set-Cookie')).toBe(
      'sensemaking-demo-student=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    )
    expect(mocks.signOut).toHaveBeenCalledWith({ data: { returnTo: '/' } })
  })

  it('uses a same-origin POST and preserves WorkOS logout cookies', async () => {
    mocks.signOut.mockImplementation(() => {
      throw redirect({
        href: 'https://workos.example/logout',
        headers: {
          'Set-Cookie': 'workos-session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
        },
        throw: true,
      })
    })

    const response = await handleSignOutPost({
      request: request('/api/auth/sign-out', {
        method: 'POST',
        headers: { Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' },
      }),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('https://workos.example/logout')
    expect(response.headers.get('Set-Cookie')).toContain('workos-session=')
    expect(response.headers.get('Set-Cookie')).toContain('sensemaking-demo-student=')
    expect(mocks.signOut).toHaveBeenCalledWith({ data: { returnTo: '/' } })
  })

  it('rejects cross-site sign-out POSTs', async () => {
    const response = await handleSignOutPost({
      request: request('/api/auth/sign-out', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
      }),
    })

    expect(response.status).toBe(403)
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('rejects sign-out POSTs that send neither Origin nor Sec-Fetch-Site', async () => {
    const response = await handleSignOutPost({
      request: request('/api/auth/sign-out', { method: 'POST' }),
    })

    expect(response.status).toBe(403)
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})

describe('/api/auth/callback', () => {
  it('attaches successful WorkOS sign-ins to a private student namespace', async () => {
    mocks.handleCallbackRoute.mockImplementation((options) => {
      return async () => {
        await options.onSuccess({ user: { id: 'user_123' } })
        return new Response(null, {
          status: 307,
          headers: { Location: '/reflect' },
        })
      }
    })

    const response = await handleCallbackGet({
      request: request('/api/auth/callback?code=ok&state=state'),
    })

    expect(response.status).toBe(307)
    expect(mocks.bootstrapPersonalStudentForCounselor).toHaveBeenCalledWith('user_123')
    expect(mocks.bootstrapDemoStudentsForCounselor).not.toHaveBeenCalled()
  })

  it('configures callback auth failures to land on the existing home route', async () => {
    mocks.handleCallbackRoute.mockImplementation((options) => {
      expect(options.errorRedirectUrl).toBe('/?authError=auth_failed')
      return async () =>
        new Response(null, {
          status: 303,
          headers: { Location: options.errorRedirectUrl },
        })
    })

    const response = await handleCallbackGet({
      request: request('/api/auth/callback?error=bad_state'),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/?authError=auth_failed')
    expect(response.headers.get('Set-Cookie')).toBe(
      'sensemaking-demo-student=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    )
  })
})
