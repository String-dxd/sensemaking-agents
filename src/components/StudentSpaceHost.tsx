import { useEffect, useMemo, useRef, useState } from 'react'
import '~/engine/student-space/style.css'
import type { Game } from '~/engine/student-space/Game'
import { createStudentSpaceBackendBridge } from '~/lib/student-space/backend-bridge'
import { applyStudentSpaceBackendSnapshot } from '~/lib/student-space/backend-snapshot'
import { studentSpaceSurfaceFromLocation } from '~/lib/student-space/route-sheets'
import { cn } from '~/lib/utils'
import { CaptureTagPicker } from './CaptureTagPicker'
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

    void (async () => {
      try {
        const engine = await import('~/engine/student-space/Game')
        if (cancelled) return
        const live = engine.createGame({
          container,
          persistence: { storage: engine.localStorageAdapter() },
          backend,
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
      <div ref={containerRef} className={cn('game fixed inset-0 h-svh w-svw', className)} />
      {game ? (
        <>
          <IslandProgressionOverlay game={game} />
          <CaptureTagPicker game={game} />
        </>
      ) : null}
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
