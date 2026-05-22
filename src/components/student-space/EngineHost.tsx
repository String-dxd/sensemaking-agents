import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import '~/engine/student-space/style.css'
import type { AuthMenuState, Game } from '~/engine/student-space/Game'
import { createStudentSpaceBackendBridge } from '~/lib/student-space/backend-bridge'
import { applyStudentSpaceBackendSnapshot } from '~/lib/student-space/backend-snapshot'
import {
  surfaceFromPathname,
  useStudentSpaceNavigate,
  useStudentSpaceRouteSync,
} from '~/lib/student-space/route-sync'
import { EngineContext } from '~/lib/student-space/use-engine'
import { cn } from '~/lib/utils'

// Surfaces that render empty without server data — we defer the open call
// until the backend snapshot resolves so the student doesn't see an empty
// shell. Other sheets (Profile, History, Letters) render meaningful chrome
// from local state and open immediately.
const SURFACES_REQUIRING_HYDRATION = new Set(['trajectory'])

/**
 * Mounts the vendored Student Space engine once at the root layout level so
 * its WebGL context and in-memory state survive route changes. Exposes the
 * live `Game` instance via `EngineContext` so any descendant React surface
 * (routed sheet pages, non-routed overlays, in-world labels) can read the
 * engine without prop drilling.
 *
 * Replaces the engine-boot half of the legacy `StudentSpaceHost.tsx`. The
 * remaining `StudentSpaceHost` shrinks to the world-route React composition
 * (overlays, capture sheets, HUDs, in-world labels) which is mounted in the
 * `/` route's component output.
 *
 * The engine is loaded via dynamic import inside `useEffect`. Static import
 * is unsafe under SSR: some engine modules read `window` / `document` at
 * top-level evaluation (e.g. `KiraDialogue.js` reads
 * `window.matchMedia('(prefers-reduced-motion: reduce)')` at module load).
 */
export function EngineHost({ className, children }: { className?: string; children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const backend = useMemo(() => createStudentSpaceBackendBridge(), [])
  const [game, setGame] = useState<Game | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const onNavigate = useStudentSpaceNavigate()
  // Stable ref so the engine's `_onNavigate` always sees the latest router
  // callback without forcing a re-mount on every navigation.
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate

  // Compute the active surface from the live router location (not
  // window.location) so memory-router tests work and SSR-derived initial
  // paths flow through correctly.
  const location = useLocation()
  const currentRouteSurface = useMemo(
    () => surfaceFromPathname(location.pathname),
    [location.pathname],
  )

  // Defer the open call for surfaces that render empty without server
  // data, until the snapshot promise has resolved.
  const paused = Boolean(
    currentRouteSurface &&
      SURFACES_REQUIRING_HYDRATION.has(currentRouteSurface.surface) &&
      !hydrated,
  )

  // Mirror URL changes onto OverlayController via the engine's
  // `openSurface` / `closeActiveSurface` methods.
  useStudentSpaceRouteSync(game, { paused })

  // Pause the engine's rAF render loop while a routed sheet covers the
  // world. The engine canvas is still mounted (cheap to resume) but the
  // Three.js scene stops ticking — eliminates the shaking/perf regressions
  // reported when switching pages and saves GPU on every non-`/` route.
  useEffect(() => {
    if (!game) return
    game.setRenderActive(location.pathname === '/')
  }, [game, location.pathname])

  // U20: SideRail is engine-rendered but React owns its lifecycle. It
  // persists across every route (the nav rail is visible on / and on every
  // routed sheet alike, so EngineHost is the correct mount scope rather
  // than StudentSpaceHost which only mounts on `/`).
  useEffect(() => {
    if (!game) return
    let widget: { dispose?: () => void; update?: () => void } | null = null
    let cancelled = false
    void (async () => {
      // @ts-expect-error untyped engine module
      const mod = (await import('~/engine/student-space/Game/View/SideRail.js')) as {
        default?: new () => { dispose?: () => void; update?: () => void }
      }
      if (cancelled) return
      const SideRail = mod.default
      if (!SideRail) return
      widget = new SideRail()
    })()
    return () => {
      cancelled = true
      try {
        widget?.dispose?.()
      } catch {
        // engine widget dispose swallows errors; preserve that posture
      }
    }
  }, [game])

  // U16–U19: OnboardingFlow is engine-rendered but React owns its lifecycle.
  // The flow runs across every route (matches legacy posture — the
  // `body.is-onboarding` class spans the world and routed surfaces alike),
  // so EngineHost is the correct mount scope. The ceremony surfaces
  // (Greeting / EggHatcher / FirstChat / FirstMood / IslandReveal /
  // EdupassLogin) still draw their own DOM under `.onboarding-root`; full
  // per-surface React rewrites layer on top of this lifecycle later.
  useEffect(() => {
    if (!game) return
    const state = (
      game as unknown as {
        state?: {
          onboarding?: { stage?: string; isDone?: boolean; completedAt?: number | null }
          auth?: { isSignedIn?: boolean }
        }
      }
    ).state
    const onb = state?.onboarding
    if (!onb || onb.isDone || onb.stage === 'done') return

    type OnboardingFlowInstance = {
      start: () => Promise<void>
      dispose?: () => void
    }
    let flow: OnboardingFlowInstance | null = null
    let cancelled = false

    void (async () => {
      const mod = (await import(
        // @ts-expect-error untyped engine module
        '~/engine/student-space/Game/View/Onboarding/OnboardingFlow.js'
      )) as { default?: new (view: unknown) => OnboardingFlowInstance }
      if (cancelled) return
      const OnboardingFlow = mod.default
      const view = (
        game as unknown as {
          view?: {
            flowers?: { hideAll?: () => void }
            tree?: { hideAll?: () => void }
            fruits?: { hideAll?: () => void }
          }
        }
      ).view
      if (!OnboardingFlow || !view) return
      // Replay the auth-resume guard the engine constructor used to run:
      // a returning signed-in student who already completed the ceremony
      // skips the reveal-prep hide-pass.
      const completedSignInReturn =
        onb.stage === 'login' && Boolean(onb.completedAt) && Boolean(state?.auth?.isSignedIn)
      if (!completedSignInReturn) {
        view.flowers?.hideAll?.()
        view.tree?.hideAll?.()
        view.fruits?.hideAll?.()
      }
      flow = new OnboardingFlow(view)
      flow.start().catch((e: unknown) => console.error('[onboarding] flow failed', e))
    })()

    return () => {
      cancelled = true
      try {
        flow?.dispose?.()
      } catch {
        // dispose is internally defensive; swallow any residual errors
      }
    }
  }, [game])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    document.body.classList.add('student-space-shell')
    let dispose: (() => void) | null = null
    let cancelled = false
    let authMenuTimeoutId: ReturnType<typeof setTimeout> | null = null

    void (async () => {
      try {
        // Fetch the server-resolved auth menu in parallel with the engine
        // dynamic import so onboarding can decide whether to skip the dummy
        // login surface and chrome can render the right sign-in / sign-out
        // affordance from the first paint. A rejection or timeout is
        // non-fatal — the engine boots with the default signed-out menu.
        const authMenuPromise: Promise<AuthMenuState | null> = backend.loadAuthMenu
          ? Promise.race<AuthMenuState | null>([
              backend.loadAuthMenu().catch((err) => {
                console.warn('[EngineHost] loadAuthMenu failed', err)
                return null
              }),
              new Promise<null>((resolve) => {
                authMenuTimeoutId = setTimeout(() => {
                  console.warn('[EngineHost] loadAuthMenu timed out after 3s')
                  resolve(null)
                }, 3000)
              }),
            ])
          : Promise.resolve(null)
        const [engine, authMenu] = await Promise.all([
          import('~/engine/student-space/Game'),
          authMenuPromise,
        ])
        if (cancelled) return
        const live = engine.createGame({
          container,
          persistence: { storage: engine.localStorageAdapter() },
          backend,
          authMenu: authMenu ?? null,
          onNavigate: (href: string) => onNavigateRef.current(href),
        })
        // Expose the live Game so the sign-out helper (which cannot static-
        // import the engine without bloating server bundles) can call
        // `dispose()` synchronously to drain Persistence before the
        // `ss:v1:*` localStorage wipe. The handle is cleared on unmount.
        window.__studentSpaceGame = live
        setGame(live)
        dispose = () => {
          window.__studentSpaceGame = null
          setGame(null)
          setHydrated(false)
          live.dispose()
        }
        // The route-sync hook drives the initial open as soon as `game`
        // flips non-null. Snapshot hydration only re-applies the route
        // surface so already-rendered sheets refresh against fresh data,
        // and unpauses hydration-gated surfaces (e.g. trajectory).
        void backend
          .refreshSnapshot?.()
          .then((snapshot) => {
            if (cancelled) return
            applyStudentSpaceBackendSnapshot(live, snapshot)
            setHydrated(true)
          })
          .catch((snapshotErr) => {
            console.warn('[EngineHost] backend snapshot hydration failed', snapshotErr)
            if (!cancelled) setHydrated(true)
          })
      } catch (err) {
        console.error('[EngineHost] createGame failed', err)
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })()

    return () => {
      cancelled = true
      if (authMenuTimeoutId != null) {
        clearTimeout(authMenuTimeoutId)
        authMenuTimeoutId = null
      }
      dispose?.()
      document.body.classList.remove('student-space-shell')
    }
  }, [backend])

  if (error) return <EngineLoadFailure error={error} />

  return (
    <EngineContext.Provider value={game}>
      {/* Engine owns positioning via `.game` (frame inset + rounded corners).
          Inline Tailwind `fixed inset-0` utilities would override the inset
          rules and the rounded frame would extend edge-to-edge. */}
      <div ref={containerRef} className={cn('game', className)} />
      {children}
    </EngineContext.Provider>
  )
}

function EngineLoadFailure({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      className="fixed inset-0 flex items-center justify-center bg-background p-6"
      data-testid="student-space-engine-failure"
    >
      <div className="max-w-md rounded-lg border border-border bg-muted/40 p-5 text-sm">
        <h2 className="font-sans text-base font-semibold text-foreground">
          The world didn’t load.
        </h2>
        <p className="mt-2 text-muted-foreground">
          The Student Space engine failed to start. Reload the page to try again, or press{' '}
          <kbd className="rounded border border-border bg-background px-1 font-mono text-xs">
            ⌘K
          </kbd>{' '}
          to navigate elsewhere.
        </p>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground/80">{error.message}</p>
      </div>
    </div>
  )
}
