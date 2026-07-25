import { afterEach, describe, expect, it } from 'vitest'
import {
  demoSignInHref,
  isDemoModeEnabled,
  normalizeDemoStudentId,
  safeReturnPathname,
  workosSignInHref,
} from '~/auth/demo'
import { clearDemoCookieHeader, demoCookieHeader } from '~/auth/demo-session.server'

describe('demo auth helpers', () => {
  it('accepts only seeded demo student ids for browser-controlled demo sessions', () => {
    expect(normalizeDemoStudentId('demo-a')).toBe('demo-a')
    expect(normalizeDemoStudentId(' demo-d ')).toBe('demo-d')
    expect(normalizeDemoStudentId('demo')).toBeNull()
    expect(normalizeDemoStudentId('real-student')).toBeNull()
  })

  it('builds safe sign-in URLs', () => {
    expect(demoSignInHref('/reflect')).toBe('/api/auth/sign-in?demo=1&returnPathname=%2Freflect')
    expect(demoSignInHref()).toBe('/api/auth/sign-in?demo=1&returnPathname=%2F')
    expect(workosSignInHref('/library')).toBe('/api/auth/sign-in?returnPathname=%2Flibrary')
  })

  it('rejects open redirects in return paths', () => {
    expect(safeReturnPathname('https://example.com')).toBe('/')
    expect(safeReturnPathname('//example.com')).toBe('/')
    expect(safeReturnPathname('/\\evil')).toBe('/')
    expect(safeReturnPathname('/library')).toBe('/library')
  })

  it('serializes fixed demo cookie headers', () => {
    expect(demoCookieHeader('demo-a', false)).toBe(
      'sensemaking-demo-student=demo-a; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax',
    )
    expect(demoCookieHeader('demo-a', true)).toBe(
      'sensemaking-demo-student=demo-a; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax; Secure',
    )
    expect(clearDemoCookieHeader(false)).toBe(
      'sensemaking-demo-student=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    )
    expect(clearDemoCookieHeader(true)).toBe(
      'sensemaking-demo-student=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure',
    )
  })
})

describe('isDemoModeEnabled', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalFlag = process.env.ENABLE_DEMO_PERSONAS

  afterEach(() => {
    // A leaked NODE_ENV='production' would silently change unrelated suites.
    process.env.NODE_ENV = originalNodeEnv
    if (originalFlag === undefined) delete process.env.ENABLE_DEMO_PERSONAS
    else process.env.ENABLE_DEMO_PERSONAS = originalFlag
  })

  it('enables demo personas outside production without any flag', () => {
    delete process.env.ENABLE_DEMO_PERSONAS

    process.env.NODE_ENV = 'development'
    expect(isDemoModeEnabled()).toBe(true)

    process.env.NODE_ENV = 'test'
    expect(isDemoModeEnabled()).toBe(true)
  })

  it('disables demo personas on an unflagged production build', () => {
    delete process.env.ENABLE_DEMO_PERSONAS
    process.env.NODE_ENV = 'production'

    expect(isDemoModeEnabled()).toBe(false)
  })

  it('re-enables demo personas in production when the deployment opts in', () => {
    process.env.NODE_ENV = 'production'
    process.env.ENABLE_DEMO_PERSONAS = '1'

    expect(isDemoModeEnabled()).toBe(true)
  })

  it('opts in on the literal "1" only, matching the ENABLE_DEV_PIPELINE idiom', () => {
    process.env.NODE_ENV = 'production'
    process.env.ENABLE_DEMO_PERSONAS = 'true'

    expect(isDemoModeEnabled()).toBe(false)
  })
})
