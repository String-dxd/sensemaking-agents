import { useLocation } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useStudentSpaceNavigate } from '~/lib/student-space/route-sync'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { normalizePathname } from './nav-active'

type GameLike = {
  state?: {
    onboarding?: {
      stage?: string
      isDone?: boolean
      subscribe?: (cb: () => void) => () => void
    }
  }
}

export interface NavGate {
  /** True when nav surfaces should not render (onboarding active or on /onboarding). */
  hidden: boolean
  /** Optimistic pathname set on tap so the active highlight flips before the route settles. */
  pendingPathname: string | null
  /** Router-aware navigate wrapper used by both SideRail and MobileNav. */
  navigate: (href: string) => void
  /** Imperative setter for tests and edge cases that need to manage pendingPathname directly. */
  setPendingPathname: (next: string | null) => void
}

/**
 * Shared gate for the two navigation surfaces (`SideRail` desktop and
 * `MobileNav` mobile). Owns:
 *  - the onboarding-hide guard (engine overlay flag, engine slice stage,
 *    pathname === '/onboarding')
 *  - the engine slice subscription so onboarding stage changes trigger
 *    re-renders
 *  - the optimistic `pendingPathname` state that flips the active item
 *    immediately on tap, cleared by a `useEffect` once the route settles
 *
 * The triple guard mirrors the original SideRail logic byte-for-byte —
 * onboarding state can be in flight via three independent signals and
 * each catches a different timing window.
 */
export function useNavGate(game: unknown): NavGate {
  const navigate = useStudentSpaceNavigate()
  const location = useLocation()
  const { isOnboarding } = useEngineOverlay()
  const [pendingPathname, setPendingPathname] = useState<string | null>(null)

  const typedGame = game as GameLike | null
  const onboarding = typedGame?.state?.onboarding
  useEngineSliceVersion(
    onboarding?.subscribe ? (onboarding as { subscribe: (cb: () => void) => () => void }) : null,
  )

  useEffect(() => {
    if (!pendingPathname) return
    if (normalizePathname(location.pathname) === pendingPathname) {
      setPendingPathname(null)
    }
  }, [location.pathname, pendingPathname])

  const onboardingStage = onboarding?.stage
  const onboardingActive = Boolean(
    onboarding &&
      !onboarding.isDone &&
      onboardingStage &&
      onboardingStage !== 'done' &&
      onboardingStage !== 'pending',
  )

  const hidden = isOnboarding || onboardingActive || location.pathname === '/onboarding'

  const navigateWithPending = (href: string) => {
    setPendingPathname(normalizePathname(href))
    navigate(href)
  }

  return {
    hidden,
    pendingPathname,
    navigate: navigateWithPending,
    setPendingPathname,
  }
}
