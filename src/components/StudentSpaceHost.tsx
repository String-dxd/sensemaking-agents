import { useEffect, useMemo, useRef, useState } from 'react'
import '~/engine/student-space/style.css'
import type { AuthMenuState, Game } from '~/engine/student-space/Game'
import { createStudentSpaceBackendBridge } from '~/lib/student-space/backend-bridge'
import { applyStudentSpaceBackendSnapshot } from '~/lib/student-space/backend-snapshot'
import { studentSpaceSurfaceFromLocation } from '~/lib/student-space/route-sheets'
import { cn } from '~/lib/utils'
import { IslandProgressionOverlay } from './IslandProgressionOverlay'

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
 */
export function StudentSpaceHost({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const backend = useMemo(() => createStudentSpaceBackendBridge(), [])
  const [game, setGame] = useState<Game | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    document.body.classList.add('student-space-shell')
    let dispose: (() => void) | null = null
    let cancelled = false

    const initialOverlay = readInitialOverlayFromLocation()

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
              new Promise<null>((resolve) =>
                setTimeout(() => {
                  console.warn('[StudentSpaceHost] loadAuthMenu timed out after 3s')
                  resolve(null)
                }, 3000),
              ),
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
          initialOverlay,
          backend,
          authMenu: authMenu ?? null,
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
          live.dispose()
        }
        const routeSurface = studentSpaceSurfaceFromLocation(window.location)
        let openedRouteBeforeHydration = false
        if (routeSurface && routeSurface.surface !== 'trajectory') {
          live.openSurface?.(routeSurface)
          openedRouteBeforeHydration = true
        }
        void backend
          .refreshSnapshot?.()
          .then((snapshot) => {
            if (cancelled) return
            applyStudentSpaceBackendSnapshot(live, snapshot)
            if (routeSurface) live.openSurface?.(routeSurface)
          })
          .catch((snapshotErr) => {
            console.warn('[StudentSpaceHost] backend snapshot hydration failed', snapshotErr)
            if (!cancelled && routeSurface && !openedRouteBeforeHydration) {
              live.openSurface?.(routeSurface)
            }
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

const KNOWN_INITIAL_OVERLAYS = new Set(['profile', 'calendar', 'letters', 'trajectory'])

/**
 * Parse `?sheet=…` from the current URL and return an `initialOverlay` arg
 * for `engine.createGame` when it matches a known overlay. The `/me` route
 * redirects to `/?sheet=profile`; this is the consumer that turns that
 * search param into an actual sheet-open after the engine boots.
 */
function readInitialOverlayFromLocation(): { name: string } | undefined {
  if (typeof window === 'undefined') return undefined
  const sheet = new URLSearchParams(window.location.search).get('sheet')
  if (!sheet || !KNOWN_INITIAL_OVERLAYS.has(sheet)) return undefined
  return { name: sheet }
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
