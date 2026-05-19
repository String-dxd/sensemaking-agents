// @vitest-environment node

/**
 * `loadAuthMenuHandler` contract — the shape the engine `Auth` state slice
 * is built against. Covers all four identity branches plus the AuthKit
 * middleware-missing soft fall-back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getDemoBypassAuthFromCookie: vi.fn(),
  getDevBypassAuth: vi.fn(),
  hasWorkosEnv: vi.fn(),
}))

vi.mock('@workos/authkit-tanstack-react-start', () => ({
  getAuth: mocks.getAuth,
}))

vi.mock('~/auth/demo-session.server', () => ({
  getDemoBypassAuthFromCookie: mocks.getDemoBypassAuthFromCookie,
}))

vi.mock('~/auth/middleware', () => ({
  getDevBypassAuth: mocks.getDevBypassAuth,
}))

vi.mock('~/auth/workos', () => ({
  hasWorkosEnv: mocks.hasWorkosEnv,
}))

const { loadAuthMenuHandler } = await import('~/server/auth-menu.handler.server')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getDevBypassAuth.mockReturnValue(null)
  mocks.hasWorkosEnv.mockReturnValue(false)
  mocks.getDemoBypassAuthFromCookie.mockReturnValue(null)
})

describe('loadAuthMenuHandler', () => {
  it('dev-bypass wins over WorkOS + demo cookie', async () => {
    mocks.getDevBypassAuth.mockReturnValue({
      counselorId: 'auth-bypass:demo-a',
      activeStudentId: 'demo-a',
    })
    mocks.hasWorkosEnv.mockReturnValue(true)
    mocks.getAuth.mockResolvedValue({
      user: { id: 'user_x', email: 'x@example.com', firstName: 'X', lastName: 'Y' },
    })
    mocks.getDemoBypassAuthFromCookie.mockReturnValue({
      counselorId: 'auth-bypass:demo-b',
      activeStudentId: 'demo-b',
    })

    await expect(loadAuthMenuHandler()).resolves.toEqual({
      status: 'signed-in',
      label: 'Dev bypass',
      detail: 'demo-a',
      kind: 'dev-bypass',
    })
  })

  it('WorkOS signed-in returns the user label and email detail', async () => {
    mocks.hasWorkosEnv.mockReturnValue(true)
    mocks.getAuth.mockResolvedValue({
      user: {
        id: 'user_x',
        email: 'reza@example.com',
        firstName: 'Reza',
        lastName: 'Ilmi',
      },
    })

    await expect(loadAuthMenuHandler()).resolves.toEqual({
      status: 'signed-in',
      label: 'Reza Ilmi',
      detail: 'reza@example.com',
      kind: 'workos',
    })
  })

  it('WorkOS signed-in with only an email returns the email as the label', async () => {
    mocks.hasWorkosEnv.mockReturnValue(true)
    mocks.getAuth.mockResolvedValue({
      user: { id: 'user_x', email: 'reza@example.com', firstName: null, lastName: null },
    })

    await expect(loadAuthMenuHandler()).resolves.toEqual({
      status: 'signed-in',
      label: 'reza@example.com',
      detail: null,
      kind: 'workos',
    })
  })

  it('falls back to the demo cookie when WorkOS resolves no user', async () => {
    mocks.hasWorkosEnv.mockReturnValue(true)
    mocks.getAuth.mockResolvedValue({ user: null })
    mocks.getDemoBypassAuthFromCookie.mockReturnValue({
      counselorId: 'auth-bypass:demo-a',
      activeStudentId: 'demo-a',
    })

    await expect(loadAuthMenuHandler()).resolves.toEqual({
      status: 'signed-in',
      label: 'Demo account',
      detail: 'demo-a',
      kind: 'demo',
    })
  })

  it('demo cookie still resolves when WorkOS is unconfigured', async () => {
    mocks.hasWorkosEnv.mockReturnValue(false)
    mocks.getDemoBypassAuthFromCookie.mockReturnValue({
      counselorId: 'auth-bypass:demo-c',
      activeStudentId: 'demo-c',
    })

    await expect(loadAuthMenuHandler()).resolves.toEqual({
      status: 'signed-in',
      label: 'Demo account',
      detail: 'demo-c',
      kind: 'demo',
    })
  })

  it('returns signed-out when nothing resolves', async () => {
    mocks.hasWorkosEnv.mockReturnValue(true)
    mocks.getAuth.mockResolvedValue({ user: null })

    await expect(loadAuthMenuHandler()).resolves.toEqual({ status: 'signed-out' })
  })

  it('swallows AuthKit middleware-missing errors and continues to demo cookie', async () => {
    mocks.hasWorkosEnv.mockReturnValue(true)
    mocks.getAuth.mockRejectedValue(new Error('AuthKit middleware is not configured'))
    mocks.getDemoBypassAuthFromCookie.mockReturnValue({
      counselorId: 'auth-bypass:demo-a',
      activeStudentId: 'demo-a',
    })

    await expect(loadAuthMenuHandler()).resolves.toMatchObject({
      status: 'signed-in',
      kind: 'demo',
    })
  })

  it('propagates other AuthKit errors', async () => {
    mocks.hasWorkosEnv.mockReturnValue(true)
    mocks.getAuth.mockRejectedValue(new Error('network is unreachable'))

    await expect(loadAuthMenuHandler()).rejects.toThrow('network is unreachable')
  })
})
