import { useLocation } from '@tanstack/react-router'
import { useLayoutEffect, useRef } from 'react'

/**
 * Tracks whether the current sheet route is being entered fresh from the
 * world (or from a cold mount) versus continued from another sheet route.
 *
 * Used by `PageSurface` to decide whether to fire the first-open stagger:
 * `'fresh'` triggers `data-fresh-enter="true"`; `'continuous'` lets the
 * subtree paint instantly (preserving the world-frame-flash fix from
 * PR #3546242 for sheet → sheet transitions).
 *
 * The previous-pathname ref is updated in a layout effect *after* the
 * render commits, so the first render of a freshly-mounted sheet observes
 * the previous (world) pathname, not its own pathname.
 */
export type PageEnterState = 'fresh' | 'continuous'

const WORLD_PATHS = new Set(['/', '/onboarding'])

export function usePageEnterState(): PageEnterState {
  const { pathname } = useLocation()
  const previousRef = useRef<string | undefined>(undefined)
  const previous = previousRef.current

  const state: PageEnterState =
    previous === undefined || WORLD_PATHS.has(previous) ? 'fresh' : 'continuous'

  useLayoutEffect(() => {
    previousRef.current = pathname
  }, [pathname])

  return state
}
