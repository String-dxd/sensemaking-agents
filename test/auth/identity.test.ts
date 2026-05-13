import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertCounselorHasStudent: vi.fn(),
  bootstrapDemoStudentsForCounselor: vi.fn(),
  deleteCookie: vi.fn(),
  findFirstAttachedStudent: vi.fn(),
  getAuth: vi.fn(),
  getCookie: vi.fn(),
  getDevBypassAuth: vi.fn(),
  hasWorkosEnv: vi.fn(),
  setCookie: vi.fn(),
}))

vi.mock('@tanstack/react-start/server', () => ({
  deleteCookie: mocks.deleteCookie,
  getCookie: mocks.getCookie,
  setCookie: mocks.setCookie,
}))

vi.mock('@workos/authkit-tanstack-react-start', () => ({
  getAuth: mocks.getAuth,
}))

vi.mock('~/auth/workos', () => ({
  hasWorkosEnv: mocks.hasWorkosEnv,
}))

vi.mock('~/auth/middleware', () => ({
  bootstrapDemoStudentsForCounselor: mocks.bootstrapDemoStudentsForCounselor,
  getDevBypassAuth: mocks.getDevBypassAuth,
}))

vi.mock('~/db/client', () => ({
  assertCounselorHasStudent: mocks.assertCounselorHasStudent,
  findFirstAttachedStudent: mocks.findFirstAttachedStudent,
}))

const { requireCounselorContext, UnauthenticatedError } = await import('~/auth/identity')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getDevBypassAuth.mockReturnValue(null)
  mocks.hasWorkosEnv.mockReturnValue(true)
  mocks.getCookie.mockReturnValue(undefined)
})

describe('requireCounselorContext', () => {
  it('uses the env bypass before any browser cookie or WorkOS lookup', async () => {
    mocks.getDevBypassAuth.mockReturnValue({
      counselorId: 'auth-bypass:demo-b',
      activeStudentId: 'demo-b',
    })
    mocks.getCookie.mockReturnValue('demo-a')

    await expect(requireCounselorContext()).resolves.toEqual({
      counselorId: 'auth-bypass:demo-b',
      studentId: 'demo-b',
    })
    expect(mocks.bootstrapDemoStudentsForCounselor).toHaveBeenCalledWith('auth-bypass:demo-b')
    expect(mocks.getAuth).not.toHaveBeenCalled()
  })

  it('uses a valid demo cookie without calling WorkOS', async () => {
    mocks.hasWorkosEnv.mockReturnValue(false)
    mocks.getCookie.mockReturnValue('demo-a')

    await expect(requireCounselorContext()).resolves.toEqual({
      counselorId: 'auth-bypass:demo-a',
      studentId: 'demo-a',
    })
    expect(mocks.bootstrapDemoStudentsForCounselor).toHaveBeenCalledWith('auth-bypass:demo-a')
    expect(mocks.getAuth).not.toHaveBeenCalled()
  })

  it('prefers a valid WorkOS session over a browser-controlled demo cookie', async () => {
    mocks.getCookie.mockReturnValue('demo-a')
    mocks.getAuth.mockResolvedValue({ user: { id: 'user_123' } })
    mocks.findFirstAttachedStudent.mockResolvedValue('demo-c')

    await expect(requireCounselorContext()).resolves.toEqual({
      counselorId: 'user_123',
      studentId: 'demo-c',
    })
    expect(mocks.bootstrapDemoStudentsForCounselor).not.toHaveBeenCalled()
    expect(mocks.assertCounselorHasStudent).toHaveBeenCalledWith('user_123', 'demo-c')
  })

  it('falls through invalid demo cookies to WorkOS auth', async () => {
    mocks.getCookie.mockReturnValue('real-student')
    mocks.getAuth.mockResolvedValue({ user: { id: 'user_123' } })
    mocks.findFirstAttachedStudent.mockResolvedValue('demo-c')

    await expect(requireCounselorContext()).resolves.toEqual({
      counselorId: 'user_123',
      studentId: 'demo-c',
    })
    expect(mocks.assertCounselorHasStudent).toHaveBeenCalledWith('user_123', 'demo-c')
  })

  it('normalizes missing AuthKit middleware to the app auth error', async () => {
    mocks.getAuth.mockRejectedValue(new Error('AuthKit middleware is not configured.'))

    await expect(requireCounselorContext()).rejects.toBeInstanceOf(UnauthenticatedError)
  })
})
