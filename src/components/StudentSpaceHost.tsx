import { useLocation } from '@tanstack/react-router'
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
import { cn } from '~/lib/utils'
import { IslandProgressionOverlay } from './IslandProgressionOverlay'

// Surfaces that render empty without server data — we defer the open call
// until the backend snapshot resolves so the student doesn't see an empty
// shell. Other sheets (Profile, History, Letters) render meaningful chrome
// from local state and open immediately.
const SURFACES_REQUIRING_HYDRATION = new Set(['trajectory'])

/**
 * Mounts the vendored Student Space engine. The engine is one-game-per-page;
 * `createGame` throws if called while a previous instance is live. React
 * StrictMode double-mount works via the documented `dispose()` lifecycle.
 *
 * Persistence uses the engine's `localStorageAdapter()` for local shell
 * state. Durable Mirror/VIPS/Cartographer operations are wired through a
 * separate host-owned backend bridge so slice persistence does not become
 * the domain integration layer.
 *
 * The engine is loaded via dynamic import inside `useEffect`. Static import
 * is unsafe under SSR: some engine modules read `window` / `document` at
 * top-level evaluation (e.g. `KiraDialogue.js` reads
 * `window.matchMedia('(prefers-reduced-motion: reduce)')` at module load).
 * The dynamic import defers evaluation to the client.
 *
 * The host mounts in `src/routes/__root.tsx` so the engine instance survives
 * route changes. URL ↔ overlay sync lives in `useStudentSpaceRouteSync`;
 * in-engine click sources call `game.navigate(href)`, which routes through
 * the `useStudentSpaceNavigate` callback we hand to `createGame`.
 */
export function StudentSpaceHost({ className }: { className?: string }) {
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
  // Mirrors the existing visibilitychange suspension pattern.
  useEffect(() => {
    if (!game) return
    game.setRenderActive(location.pathname === '/')
  }, [game, location.pathname])

  // Hydration replay is handled by the route-sync hook: when `paused`
  // flips false (snapshot resolved), the hook re-fires its effect and
  // opens the current surface against fresh data. No separate replay
  // effect needed — duplicating it caused `openSurface` to run twice
  // in the same commit under StrictMode.

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
        // non-fatal — the engine boots with the default signed-out menu,
        // matching what a truly signed-out visitor would see. The timeout
        // exists so a hung AuthKit middleware can never block engine boot
        // indefinitely.
        const authMenuPromise: Promise<AuthMenuState | null> = backend.loadAuthMenu
          ? Promise.race<AuthMenuState | null>([
              backend.loadAuthMenu().catch((err) => {
                console.warn('[StudentSpaceHost] loadAuthMenu failed', err)
                return null
              }),
              new Promise<null>((resolve) => {
                authMenuTimeoutId = setTimeout(() => {
                  console.warn('[StudentSpaceHost] loadAuthMenu timed out after 3s')
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
            console.warn('[StudentSpaceHost] backend snapshot hydration failed', snapshotErr)
            if (!cancelled) setHydrated(true)
          })
      } catch (err) {
        console.error('[StudentSpaceHost] createGame failed', err)
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
    <>
      {/* Engine owns positioning via `.game` (frame inset + rounded corners).
          Inline Tailwind `fixed inset-0` utilities would override the inset
          rules and the rounded frame would extend edge-to-edge. */}
      <div ref={containerRef} className={cn('game', className)} />
      {game ? <IslandProgressionOverlay game={game} /> : null}
    </>
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
