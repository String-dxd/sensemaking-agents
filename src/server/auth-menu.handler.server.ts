import { getAuth } from '@workos/authkit-tanstack-react-start'

import { getDemoBypassAuthFromCookie } from '~/auth/demo-session.server'
import { getDevBypassAuth } from '~/auth/middleware'
import { hasWorkosEnv } from '~/auth/workos'

export type AuthMenuState =
  | { status: 'signed-out' }
  | {
      status: 'signed-in'
      label: string
      detail: string | null
      kind: 'workos' | 'demo' | 'dev-bypass'
    }

export async function loadAuthMenuHandler(): Promise<AuthMenuState> {
  const devBypass = getDevBypassAuth()
  if (devBypass) {
    return {
      status: 'signed-in',
      label: 'Dev bypass',
      detail: devBypass.activeStudentId,
      kind: 'dev-bypass',
    }
  }

  if (hasWorkosEnv()) {
    const workosState = await loadWorkosAuthMenu()
    if (workosState.status === 'signed-in') return workosState
  }

  const demoBypass = getDemoBypassAuthFromCookie()
  if (demoBypass) {
    return {
      status: 'signed-in',
      label: 'Demo account',
      detail: demoBypass.activeStudentId,
      kind: 'demo',
    }
  }

  return { status: 'signed-out' }
}

async function loadWorkosAuthMenu(): Promise<AuthMenuState> {
  try {
    const auth = await getAuth()
    if (!auth.user) return { status: 'signed-out' }

    const email = stringValue(auth.user.email)
    const name = [stringValue(auth.user.firstName), stringValue(auth.user.lastName)]
      .filter(Boolean)
      .join(' ')
    return {
      status: 'signed-in',
      label: name || email || 'Signed in',
      detail: name && email ? email : null,
      kind: 'workos',
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('AuthKit middleware is not configured')) {
      return { status: 'signed-out' }
    }
    throw err
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
