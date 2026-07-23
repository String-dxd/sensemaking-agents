// @vitest-environment node

/**
 * `handleSignInPost`'s demo student switch — the persona switcher in
 * Settings POSTs here with an explicit `student` id. Covers the resolution
 * order (explicit id > preserved cookie > default) plus the pre-existing
 * same-origin and default-behavior regressions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(),
  getDemoBypassAuthFromCookie: vi.fn(),
}))

vi.mock('~/auth/same-origin', () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
}))

vi.mock('~/auth/demo-session.server', () => ({
  demoCookieHeader: (studentId: string) => `sensemaking-demo-student=${studentId}`,
  getDemoBypassAuthFromCookie: mocks.getDemoBypassAuthFromCookie,
}))

const { handleSignInPost } = await import('~/routes/api/auth/sign-in')

function makeRequest(search: string) {
  return new Request(`https://example.test/api/auth/sign-in${search}`, { method: 'POST' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isSameOriginRequest.mockReturnValue(true)
  mocks.getDemoBypassAuthFromCookie.mockReturnValue(null)
})

describe('handleSignInPost — demo student switch', () => {
  it('an explicit valid student param wins', async () => {
    const res = await handleSignInPost({ request: makeRequest('?demo=1&student=demo-b') })
    expect(res.status).toBe(303)
    expect(res.headers.get('Set-Cookie')).toContain('sensemaking-demo-student=demo-b')
  })

  it('an invalid student param falls back to the preserved existing cookie', async () => {
    mocks.getDemoBypassAuthFromCookie.mockReturnValue({
      counselorId: 'auth-bypass:demo-c',
      activeStudentId: 'demo-c',
    })
    const res = await handleSignInPost({
      request: makeRequest('?demo=1&student=not-a-student'),
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('Set-Cookie')).toContain('sensemaking-demo-student=demo-c')
  })

  it('no student param and no cookie falls back to demo-a (regression)', async () => {
    const res = await handleSignInPost({ request: makeRequest('?demo=1') })
    expect(res.status).toBe(303)
    expect(res.headers.get('Set-Cookie')).toContain('sensemaking-demo-student=demo-a')
  })

  it('a non-same-origin request is rejected with 403 (regression)', async () => {
    mocks.isSameOriginRequest.mockReturnValue(false)
    const res = await handleSignInPost({ request: makeRequest('?demo=1&student=demo-b') })
    expect(res.status).toBe(403)
  })
})
