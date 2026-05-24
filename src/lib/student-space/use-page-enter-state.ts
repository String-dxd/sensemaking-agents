import { useRouter } from '@tanstack/react-router'
import { useLayoutEffect } from 'react'

/**
 * Tracks whether the current sheet route is being entered fresh from the
 * world (or from a cold mount) versus continued from another sheet route.
 *
 * Used by `PageSurface` to decide whether to fire the first-open stagger:
 * `'fresh'` triggers `data-fresh-enter="true"`; `'continuous'` lets the
 * subtree paint instantly (preserving the world-frame-flash fix from
 * PR #3546242 for sheet → sheet transitions).
 *
 * Implementation notes:
 *
 * - The previous-pathname snapshot lives at *module* scope rather than in
 *   a hook ref. `PageSurface` remounts on every sheet → sheet route swap;
 *   a hook-scoped ref would always start `undefined` on a fresh mount and
 *   the stagger would fire on every navigation — exactly the regression
 *   the world-frame flash fix was trying to avoid.
 * - We use `useRouter({ warn: false })` instead of `useLocation` so the
 *   hook is safe to call outside a `RouterProvider` (notably in unit
 *   tests). Without a router, we return `'fresh'` (the cold-mount
 *   default).
 * - Reactivity is not required: `PageSurface` re-renders every route
 *   change because the parent route component remounts. Each fresh render
 *   reads the module-scoped previous pathname synchronously.
 */
export type PageEnterState = 'fresh' | 'continuous'

const WORLD_PATHS = new Set(['/', '/onboarding'])

let previousPathname: string | undefined

export function usePageEnterState(): PageEnterState {
  const router = useRouter({ warn: false }) as {
    state?: { location?: { pathname?: string } }
  } | null
  const pathname = router?.state?.location?.pathname

  const previous = previousPathname
  const state: PageEnterState =
    pathname === undefined || previous === undefined || WORLD_PATHS.has(previous)
      ? 'fresh'
      : 'continuous'

  useLayoutEffect(() => {
    if (pathname !== undefined) previousPathname = pathname
  }, [pathname])

  return state
}

/**
 * Companion hook for `usePageEnterState`. Call once from a component that
 * is always mounted across the app's route changes (e.g. `EngineHost`) so
 * the previous-pathname snapshot stays in sync even when the user crosses
 * world routes that don't mount a `PageSurface`. Without this, a /profile
 * → / → /history navigation would incorrectly see previousPathname as
 * '/profile' and skip the fresh-enter stagger.
 */
export function useTrackPreviousPathnameForEnterState(): void {
  const router = useRouter({ warn: false }) as {
    state?: { location?: { pathname?: string } }
  } | null
  const pathname = router?.state?.location?.pathname

  useLayoutEffect(() => {
    if (pathname !== undefined) previousPathname = pathname
  }, [pathname])
}

/**
 * Test-only reset of the module-scoped previous-pathname snapshot.
 * Exposed so unit tests can isolate enter-state behavior between cases.
 */
export function __resetPageEnterStateForTests(): void {
  previousPathname = undefined
}
