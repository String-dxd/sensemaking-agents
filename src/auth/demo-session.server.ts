import { getCookie } from '@tanstack/react-start/server'
import {
  DEFAULT_DEMO_STUDENT_ID,
  DEMO_AUTH_COOKIE,
  DEMO_COOKIE_MAX_AGE_SECONDS,
  type DemoStudentId,
  makeBypassIdentity,
  normalizeDemoStudentId,
} from './demo'

export function getDemoBypassAuthFromCookie() {
  let raw: string | undefined
  try {
    raw = getCookie(DEMO_AUTH_COOKIE)
  } catch {
    return null
  }
  const studentId = normalizeDemoStudentId(raw)
  return studentId ? makeBypassIdentity(studentId) : null
}

export function demoCookieHeader(
  studentId: DemoStudentId = DEFAULT_DEMO_STUDENT_ID,
  secure = process.env.NODE_ENV === 'production',
): string {
  return [
    `${DEMO_AUTH_COOKIE}=${encodeURIComponent(studentId)}`,
    `Max-Age=${DEMO_COOKIE_MAX_AGE_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ')
}

export function clearDemoCookieHeader(secure = process.env.NODE_ENV === 'production'): string {
  return [
    `${DEMO_AUTH_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ')
}
