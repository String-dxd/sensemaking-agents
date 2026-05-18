import { useEffect, useRef, useState } from 'react'

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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let dispose: (() => void) | null = null
    let cancelled = false

    void (async () => {
      try {
        const engine = await import('~/engine/student-space/Game')
        if (cancelled) return
        const game = engine.createGame({
          container,
          persistence: { storage: engine.localStorageAdapter() },
        })
        dispose = () => game.dispose()
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
    }
  }, [])

  if (error) return <EngineLoadFailure error={error} />

  return <div ref={containerRef} className={className ?? 'fixed inset-0 h-svh w-svw'} />
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
