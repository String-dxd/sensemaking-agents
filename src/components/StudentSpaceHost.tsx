import { useEffect, useRef, useState } from 'react'
import '~/engine/student-space/style.css'
import type { Game } from '~/engine/student-space/Game'
import { cn } from '~/lib/utils'
import { CaptureTagPicker } from './CaptureTagPicker'
import { IslandProgressionOverlay } from './IslandProgressionOverlay'

/**
 * Mounts the vendored Student Space engine. The engine is one-game-per-page;
 * `createGame` throws if called while a previous instance is live. React
 * StrictMode double-mount works via the documented `dispose()` lifecycle.
 *
 * Persistence currently uses the engine's default `localStorageAdapter()`.
 * Backend wiring (Postgres-backed StorageAdapter) is deferred — see plan
 * `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md`.
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
        const engine = await import('~/engine/student-space/Game')
        if (cancelled) return
        const live = engine.createGame({
          container,
          persistence: { storage: engine.localStorageAdapter() },
          initialOverlay,
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
  }, [])

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
