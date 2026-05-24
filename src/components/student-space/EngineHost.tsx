import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import '~/engine/student-space/style.css'
import type { AuthMenuState, Game } from '~/engine/student-space/Game'
import { createStudentSpaceBackendBridge } from '~/lib/student-space/backend-bridge'
import { applyStudentSpaceBackendSnapshot } from '~/lib/student-space/backend-snapshot'
import { useCameraPreset } from '~/lib/student-space/camera-tuner'
import {
  surfaceFromPathname,
  useStudentSpaceNavigate,
  useStudentSpaceRouteSync,
} from '~/lib/student-space/route-sync'
import { EngineContext } from '~/lib/student-space/use-engine'
import { EngineOverlayProvider, useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { useTrackPreviousPathnameForEnterState } from '~/lib/student-space/use-page-enter-state'
import { cn } from '~/lib/utils'
import { AskSheet } from './capture/AskSheet'
import { CaptureChooser } from './capture/CaptureChooser'
import { MoodSheet } from './capture/MoodSheet'
import { SideRail } from './navigation/SideRail'
import { CameraTuneHud, type CameraTuneTargets } from './onboarding/CameraTuneHud'
import { OnboardingFlow } from './onboarding/OnboardingFlow'

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
 * is unsafe under SSR: some engine modules still expect a browser-owned
 * `window` / `document` during evaluation.
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
  const isWorldRoute = location.pathname === '/' || location.pathname === '/onboarding'

  // Keep the page-enter-state module in sync with the live pathname, even
  // on world routes where no PageSurface is mounted. Without this, a
  // /profile → / → /history navigation would skip the fresh-enter stagger
  // on /history because previousPathname would still be '/profile'.
  useTrackPreviousPathnameForEnterState()

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
    game.setRenderActive(isWorldRoute)
  }, [game, isWorldRoute])

  useEffect(() => {
    document.body.classList.toggle('student-space-page-route', !isWorldRoute)
    return () => document.body.classList.remove('student-space-page-route')
  }, [isWorldRoute])

  // U16: OnboardingFlow is now a React component (`<OnboardingFlow />`)
  // rendered as a child of EngineHost — see below. The reveal-prep hide-
  // pass (flowers/tree/fruits.hideAll) runs here so it fires immediately
  // after engine boot rather than waiting for the React orchestrator's
  // first render.
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
    const completedSignInReturn =
      onb.stage === 'login' && Boolean(onb.completedAt) && Boolean(state?.auth?.isSignedIn)
    if (completedSignInReturn) return
    const view = (
      game as unknown as {
        view?: {
          flowers?: { hideAll?: () => void }
          tree?: { hideAll?: () => void }
          fruits?: { hideAll?: () => void }
        }
      }
    ).view
    view?.flowers?.hideAll?.()
    view?.tree?.hideAll?.()
    view?.fruits?.hideAll?.()
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
      <EngineOverlayProvider>
        {/* Engine owns positioning via `.game` (frame inset + rounded corners).
            Inline Tailwind `fixed inset-0` utilities would override the inset
            rules and the rounded frame would extend edge-to-edge.

            The sky gradient is inlined on the element (not just in the .game
            CSS rule) so it survives the brief window during HMR where the
            engine stylesheet is unloaded — without this the .game rule
            briefly disappears and the body shows through as a white sky. */}
        <div
          ref={containerRef}
          aria-hidden={!isWorldRoute}
          className={cn(
            'game transition-opacity duration-[280ms] ease-(--ease-out) motion-reduce:transition-none',
            !isWorldRoute && 'pointer-events-none opacity-0',
            className,
          )}
          style={{
            background:
              'linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 42%, var(--sky-bottom) 100%)',
          }}
        />
        <RouteOverlayEffects isWorldRoute={isWorldRoute} />
        {game ? <SideRail game={game} /> : null}
        {game ? <CaptureOverlayBridge game={game} /> : null}
        <CaptureChooser />
        <AskSheet />
        <MoodSheet />
        <OnboardingFlow />
        {import.meta.env.DEV && game ? <CameraTuneBridge game={game} /> : null}
        {children}
      </EngineOverlayProvider>
    </EngineContext.Provider>
  )
}

/**
 * DEV-only bridge: mounts the camera tuner HUD globally and feeds the
 * `world-default` preset into the live engine so tweaks land on the actual
 * static framing without a remount. The HUD itself is hidden until the
 * palette dispatches CAMERA_TUNER_OPEN_EVENT.
 */
function CameraTuneBridge({ game }: { game: Game }) {
  const worldDefault = useCameraPreset('world-default')
  const view = (game as unknown as { view?: CameraTuneTargets }).view ?? null

  useEffect(() => {
    const camera = view?.camera as
      | {
          setDefaultFraming?: (
            pose: { fov: number; distance: number; pitchDeg: number; target: Vector3 },
            options?: { apply?: boolean },
          ) => void
        }
      | null
      | undefined
    camera?.setDefaultFraming?.({
      fov: worldDefault.fov,
      distance: worldDefault.distance,
      pitchDeg: worldDefault.pitchDeg,
      target: new Vector3(worldDefault.lookAtX, worldDefault.lookAtY, worldDefault.lookAtZ),
    })
  }, [view, worldDefault])

  return <CameraTuneHud targets={view} />
}

function RouteOverlayEffects({ isWorldRoute }: { isWorldRoute: boolean }) {
  const overlay = useEngineOverlay()
  const { closeCapture, setActiveChooser } = overlay

  useEffect(() => {
    if (isWorldRoute) return
    closeCapture()
    setActiveChooser(false)
  }, [closeCapture, isWorldRoute, setActiveChooser])

  return null
}

function CaptureOverlayBridge({ game }: { game: Game }) {
  const overlay = useEngineOverlay()
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay

  useEffect(() => {
    const controller = (
      game as unknown as {
        view?: {
          overlayController?: {
            register?: (
              name: string,
              surface: {
                open?: (opts?: Record<string, unknown>) => void
                close?: () => void
              },
            ) => void
            unregister?: (name: string) => void
          }
        }
      }
    ).view?.overlayController
    if (!controller?.register) return

    controller.register('chooser', {
      open: () => overlayRef.current.setActiveChooser(true),
      close: () => overlayRef.current.setActiveChooser(false),
    })
    controller.register('ask', {
      open: (opts = {}) => overlayRef.current.openCapture('ask', opts),
      close: () => overlayRef.current.closeCapture(),
    })
    controller.register('photo', {
      open: (opts = {}) => overlayRef.current.openCapture('ask', opts),
      close: () => overlayRef.current.closeCapture(),
    })
    controller.register('mood', {
      open: (opts = {}) => overlayRef.current.openCapture('mood', opts),
      close: () => overlayRef.current.closeCapture(),
    })

    return () => {
      controller.unregister?.('chooser')
      controller.unregister?.('ask')
      controller.unregister?.('photo')
      controller.unregister?.('mood')
    }
  }, [game])

  return null
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
