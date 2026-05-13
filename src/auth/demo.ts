export const DEMO_STUDENT_IDS = ['demo-a', 'demo-b', 'demo-c', 'demo-d'] as const
export type DemoStudentId = (typeof DEMO_STUDENT_IDS)[number]

export const DEFAULT_DEMO_STUDENT_ID: DemoStudentId = 'demo-a'
export const DEMO_AUTH_COOKIE = 'sensemaking-demo-student'
export const DEMO_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export interface DevBypassIdentity {
  counselorId: string
  activeStudentId: string
}

export function makeBypassIdentity(studentId: string): DevBypassIdentity {
  return {
    counselorId: `auth-bypass:${studentId}`,
    activeStudentId: studentId,
  }
}

export function normalizeDemoStudentId(value: unknown): DemoStudentId | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return isDemoStudentId(trimmed) ? trimmed : null
}

export function isDemoStudentId(value: string): value is DemoStudentId {
  return (DEMO_STUDENT_IDS as readonly string[]).includes(value)
}

export function demoSignInHref(returnPathname = '/reflect'): string {
  const search = new URLSearchParams({
    demo: '1',
    returnPathname: safeReturnPathname(returnPathname),
  })
  return `/api/auth/sign-in?${search.toString()}`
}

export function workosSignInHref(returnPathname = '/reflect'): string {
  const search = new URLSearchParams({ returnPathname: safeReturnPathname(returnPathname) })
  return `/api/auth/sign-in?${search.toString()}`
}

export function safeReturnPathname(
  value: string | null | undefined,
  fallback = '/reflect',
): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return fallback
  }
  return trimmed
}
