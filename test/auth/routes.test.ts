// @vitest-environment node

import { redirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bootstrapDemoStudentsForCounselor: vi.fn(),
  getSignInUrl: vi.fn(),
  handleCallbackRoute: vi.fn(),
  hasWorkosEnv: vi.fn(),
  isAuthBypassed: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('~/auth/workos', () => ({
  hasWorkosEnv: mocks.hasWorkosEnv,
}))

vi.mock('~/auth/middleware', () => ({
  bootstrapDemoStudentsForCounselor: mocks.bootstrapDemoStudentsForCounselor,
  isAuthBypassed: mocks.isAuthBypassed,
}))

vi.mock('@workos/authkit-tanstack-react-start', () => ({
  getSignInUrl: mocks.getSignInUrl,
  handleCallbackRoute: mocks.handleCallbackRoute,
  signOut: mocks.signOut,
}))

const [{ handleSignInGet, handleSignInPost }, { handleSignOutGet }, { handleCallbackGet }] =
  await Promise.all([
    import('~/routes/api/auth/sign-in.tsx'),
    import('~/routes/api/auth/sign-out.tsx'),
    import('~/routes/api/auth/callback.tsx'),
  ])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasWorkosEnv.mockReturnValue(true)
  mocks.isAuthBypassed.mockReturnValue(false)
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

  it('preserves absent WorkOS returnPathname instead of forcing /reflect', async () => {
    mocks.getSignInUrl.mockResolvedValue('https://workos.example/auth')

    const response = await handleSignInGet({
      request: request('/api/auth/sign-in'),
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('https://workos.example/auth')
    expect(mocks.getSignInUrl).toHaveBeenCalledWith(undefined)
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

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/')
    expect(response.headers.get('Set-Cookie')).toBe(
      'sensemaking-demo-student=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    )
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })
})

describe('/api/auth/callback', () => {
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
