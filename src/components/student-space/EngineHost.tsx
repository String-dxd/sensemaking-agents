import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { toast as sonnerToast } from 'sonner'
import '~/engine/student-space/style.css'
import type { AuthMenuState, Game } from '~/engine/student-space/Game'
import {
  createStudentSpaceBackendBridge,
  DEMO_CONNECTOR_FINISHED_EVENT,
} from '~/lib/student-space/backend-bridge'
import { applyStudentSpaceBackendSnapshot } from '~/lib/student-space/backend-snapshot'
import {
  surfaceFromPathname,
  useStudentSpaceNavigate,
  useStudentSpaceRouteSync,
} from '~/lib/student-space/route-sync'
import { EngineContext, EngineHydrationContext } from '~/lib/student-space/use-engine'
import { EngineOverlayProvider, useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { useTrackPreviousPathnameForEnterState } from '~/lib/student-space/use-page-enter-state'
import { cn } from '~/lib/utils'
import { AskSheet } from './capture/AskSheet'
import { CaptureChooser } from './capture/CaptureChooser'
import { MoodSheet } from './capture/MoodSheet'
import { MobileNav } from './navigation/MobileNav'
import { SideRail } from './navigation/SideRail'
import { OnboardingFlow } from './onboarding/OnboardingFlow'

// DEV-only camera tuner. Lazy because `CameraTuneHud` (and the bridge's own
// `Vector3` use) pull three.js into whatever chunk imports them — a static
// edge here would drag the renderer onto the pre-hydration chunk graph.
const LazyCameraTuneBridge = lazy(() => import('./CameraTuneBridge'))

// Surfaces that render empty without server data — we defer the open call
// until the backend snapshot resolves so the student doesn't see an empty
// shell. Other sheets (Profile, History, Letters) render meaningful chrome
// from local state and open immediately.
const SURFACES_REQUIRING_HYDRATION = new Set(['trajectory'])

// Boot-critical world assets. The engine only requests these once `View`
// constructs (textures in `Game/View/Island.js:_loadTextures`, GLBs through
// `Game/View/assetLoader.ts`), which is several hundred ms after hydration —
// preloading overlaps those downloads with the engine chunk fetch instead.
// Keep in sync with `Island.js:_loadTextures` and `MODEL_URLS`; a drifted
// entry is harmless (one wasted request) but silently stops helping.
const BOOT_ASSET_PRELOADS: Array<{ href: string; as: 'image' | 'fetch' }> = [
  { href: '/student-space/textures/sand-soft-ripples.png', as: 'image' },
  { href: '/student-space/textures/cliff-soft-strata.png', as: 'image' },
  { href: '/student-space/textures/water-foam-cells.png', as: 'image' },
  { href: '/student-space/textures/water-short-bubbles.png', as: 'image' },
  { href: '/models/tree.glb', as: 'fetch' },
  { href: '/models/character.glb', as: 'fetch' },
]

function preloadBootAssets() {
  for (const { href, as } of BOOT_ASSET_PRELOADS) {
    // Idempotent: this module re-evaluates under HMR.
    if (document.querySelector(`link[rel="preload"][href="${href}"]`)) continue
    const link = document.createElement('link')
    link.rel = 'preload'
    link.href = href
    link.as = as
    // GLBs are fetched by GLTFLoader's FileLoader (XHR), which the preload
    // cache only matches when the CORS mode agrees. Textures load through
    // `Image` with no crossorigin, so they must stay bare.
    if (as === 'fetch') link.crossOrigin = 'anonymous'
    document.head.append(link)
  }
}

// Kick off the engine chunk download as soon as this module evaluates in the
// browser — the mount effect awaits the same promise, so the fetch overlaps
// hydration instead of starting after it. SSR never touches it (the engine
// assumes a browser-owned window/document at eval time).
const enginePromise = typeof window === 'undefined' ? null : import('~/engine/student-space/Game')
if (typeof window !== 'undefined') preloadBootAssets()

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
export function EngineHost({
  className,
  children,
  showOnboardingFlow = true,
  hideCompanion = false,
  landingShowcase = false,
  authMenu,
}: {
  className?: string
  children?: ReactNode
  showOnboardingFlow?: boolean
  hideCompanion?: boolean
  // Server-resolved auth menu, already awaited by the `_app` route's
  // `beforeLoad`. When provided (including an explicit `null`) the host skips
  // its own `backend.loadAuthMenu()` round trip entirely — that RPC used to
  // gate `createGame` behind a second fetch plus a 3s timeout. Leave it
  // `undefined` and the legacy bridge-fetch path runs instead.
  authMenu?: AuthMenuState | null
  // When true, populate the island (all flowers, the tree, butterflies)
  // so signed-out visitors see a mature island instead of the sparse
  // one. Reverts on cleanup so a sign-in transition lands cleanly on
  // the empty onboarding stage.
  landingShowcase?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<Error | null>(null)
  // Live-engine handle for the bridge's snapshot-apply seam. A ref (not the
  // `game` state) because the bridge is constructed once, before the engine
  // exists, and must keep seeing the current instance across boots.
  const gameRef = useRef<Game | null>(null)
  const backend = useMemo(
    () =>
      createStudentSpaceBackendBridge({
        // Plan 066: the capture-time Connector run pushes its fresh snapshot
        // into the engine through this callback instead of reaching for the
        // `window.__studentSpaceGame` global. No engine mounted → no-op.
        applySnapshot: (snapshot) => {
          const live = gameRef.current
          if (!live) return
          applyStudentSpaceBackendSnapshot(live, snapshot)
        },
      }),
    [],
  )
  const [game, setGame] = useState<Game | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const onNavigate = useStudentSpaceNavigate()
  // Stable ref so the engine's `_onNavigate` always sees the latest router
  // callback without forcing a re-mount on every navigation.
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate
  // Same ref trick for the auth-menu prop: the boot effect must stay keyed on
  // `[backend]` alone, so a new prop identity can never remount the engine.
  const authMenuPropRef = useRef(authMenu)
  authMenuPropRef.current = authMenu

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
    if (!game || !hideCompanion) return
    const group = (game as unknown as { view?: { kira?: { group?: { visible: boolean } } } }).view
      ?.kira?.group
    if (!group) return
    const previousVisible = group.visible
    group.visible = false
    return () => {
      group.visible = previousVisible
    }
  }, [game, hideCompanion])

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

  // Landing-page showcase: when a signed-out visitor is on /onboarding the
  // engine renders behind the login surface. Surface every flower, the
  // tree, and the full butterfly count so the preview reads as "what a
  // mature island looks like" rather than the sparse onboarding start
  // state. Cleanup re-hides them so a sign-in transition drops cleanly
  // onto the empty onboarding stage.
  useEffect(() => {
    if (!game || !landingShowcase) return
    const view = (
      game as unknown as {
        view?: {
          flowers?: { showAll?: () => void; hideAll?: () => void }
          tree?: { showAll?: () => void; hideAll?: () => void }
          butterflies?: {
            showAll?: () => void
            hideAll?: () => void
            showCount?: (n: number) => void
          }
        }
      }
    ).view
    if (!view) return
    view.flowers?.showAll?.()
    view.tree?.showAll?.()
    view.butterflies?.showAll?.()
    return () => {
      view.flowers?.hideAll?.()
      view.tree?.hideAll?.()
      view.butterflies?.hideAll?.()
    }
  }, [game, landingShowcase])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    document.body.classList.add('student-space-shell')
    let dispose: (() => void) | null = null
    let cancelled = false
    let authMenuTimeoutId: ReturnType<typeof setTimeout> | null = null

    void (async () => {
      try {
        // The auth menu decides whether onboarding skips the dummy login
        // surface and which sign-in / sign-out affordance chrome paints. When
        // the route handed us one, use it — re-fetching would only re-derive
        // what the router already awaited. Otherwise fall back to the bridge
        // fetch, raced against a 3s timeout; a rejection or timeout is
        // non-fatal, the engine boots with the default signed-out menu.
        const providedAuthMenu = authMenuPropRef.current
        const authMenuPromise: Promise<AuthMenuState | null> =
          providedAuthMenu !== undefined
            ? Promise.resolve(providedAuthMenu)
            : backend.loadAuthMenu
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
          // Already in flight since module eval in the browser; the `??` keeps
          // non-DOM test environments (no `window` at eval time) working.
          enginePromise ?? import('~/engine/student-space/Game'),
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
        gameRef.current = live
        setGame(live)
        dispose = () => {
          window.__studentSpaceGame = null
          gameRef.current = null
          setGame(null)
          setHydrated(false)
          live.dispose()
        }
        // The route-sync hook drives the initial open as soon as `game`
        // flips non-null. Snapshot hydration only re-applies the route
        // surface so already-rendered sheets refresh against fresh data,
        // and unpauses hydration-gated surfaces (e.g. trajectory).
        // A bridge may legitimately omit `refreshSnapshot` (the field is
        // optional in StudentSpaceBackendBridge). Calling it with the
        // optional-call operator and chaining off the result short-circuits
        // the WHOLE chain to `undefined` when the method is absent, so
        // neither `.then` nor `.catch` runs and `hydrated` stays false
        // forever — pausing hydration-gated surfaces and pinning the History
        // calendar skeleton. Branch explicitly instead.
        const refresh = backend.refreshSnapshot
        if (refresh) {
          void refresh()
            .then((snapshot) => {
              if (cancelled) return
              applyStudentSpaceBackendSnapshot(live, snapshot)
              setHydrated(true)
            })
            .catch((snapshotErr) => {
              console.warn('[EngineHost] backend snapshot hydration failed', snapshotErr)
              if (!cancelled) setHydrated(true)
            })
        } else if (!cancelled) {
          // No snapshot source: hydration is trivially settled.
          setHydrated(true)
        }
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
      <EngineHydrationContext.Provider value={hydrated}>
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
          {game ? <MobileNav game={game} /> : null}
          {game ? <CaptureOverlayBridge game={game} /> : null}
          <CaptureChooser />
          <AskSheet />
          <MoodSheet />
          {showOnboardingFlow ? <OnboardingFlow /> : null}
          {import.meta.env.DEV && game ? (
            <Suspense fallback={null}>
              <LazyCameraTuneBridge game={game} />
            </Suspense>
          ) : null}
          {game ? <MatureIslandBridge game={game} /> : null}
          <DemoConnectorAckBridge />
          {children}
        </EngineOverlayProvider>
      </EngineHydrationContext.Provider>
    </EngineContext.Provider>
  )
}

const DEMO_CONNECTOR_ACK_TOAST_ID = 'demo-connector-ack'
const DEMO_CONNECTOR_ACK_TTL_MS = 3200

/**
 * The acknowledgment beat for the capture-time Connector run (plan 066,
 * copy authored in plan 041 Step 6). Flag-gated, listen-only, and
 * deliberately silent on every non-success path: no toast when the run
 * failed, and none when it produced nothing (`succeeded === 0`). Never an
 * error message — the tone constraint is "still listening", never
 * "rejected", and no XP/points/streak framing.
 *
 * Renders through the `<Toaster>` the world route already mounts
 * (`IslandProgressionOverlay`), which is where captures happen; a second
 * Toaster would duplicate every toast in the app.
 */
function DemoConnectorAckBridge() {
  useEffect(() => {
    if (import.meta.env.VITE_DEMO_CONNECTOR_AT_CAPTURE !== '1') return
    const onFinished = (event: Event) => {
      const succeeded = (event as CustomEvent<{ succeeded?: number }>).detail?.succeeded ?? 0
      if (succeeded <= 0) return
      sonnerToast.custom(
        () => (
          <div className="pointer-events-auto flex w-[min(90vw,380px)] items-center rounded-2xl bg-[rgba(20,28,18,0.92)] px-3.5 py-2.5 text-xs font-medium text-[#fffbe6] shadow-[0_10px_30px_rgba(0,0,0,0.24)] backdrop-blur-md">
            Heard. Something is growing on the island.
          </div>
        ),
        { duration: DEMO_CONNECTOR_ACK_TTL_MS, id: DEMO_CONNECTOR_ACK_TOAST_ID },
      )
    }
    window.addEventListener(DEMO_CONNECTOR_FINISHED_EVENT, onFinished)
    return () => window.removeEventListener(DEMO_CONNECTOR_FINISHED_EVENT, onFinished)
  }, [])
  return null
}

/**
 * DEV-only bridge: mounts the camera tuner HUD globally and feeds the
 * `world-default` preset into the live engine so tweaks land on the actual
 * static framing without a remount. The HUD itself is hidden until the
 * palette dispatches CAMERA_TUNER_OPEN_EVENT.
 */
function MatureIslandBridge({ game }: { game: Game }) {
  useEffect(() => {
    const view = (
      game as unknown as {
        view?: {
          flowers?: { showAll?: () => void; hideAll?: () => void }
          tree?: { showAll?: () => void; hideAll?: () => void }
          butterflies?: {
            showAll?: () => void
            hideAll?: () => void
            showCount?: (n: number) => void
          }
        }
      }
    ).view
    if (!view) return
    const handler = (e: Event) => {
      const on = (e as CustomEvent<{ on?: boolean }>).detail?.on
      if (on) {
        view.flowers?.showAll?.()
        view.tree?.showAll?.()
        view.butterflies?.showAll?.()
      } else {
        view.flowers?.hideAll?.()
        view.tree?.hideAll?.()
        view.butterflies?.hideAll?.()
      }
    }
    window.addEventListener('ss:mature-island-toggle', handler)
    return () => window.removeEventListener('ss:mature-island-toggle', handler)
  }, [game])
  return null
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
