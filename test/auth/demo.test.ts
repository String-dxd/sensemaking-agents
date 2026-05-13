import { describe, expect, it } from 'vitest'
import {
  demoSignInHref,
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
