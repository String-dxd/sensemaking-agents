import { useEffect, useRef } from 'react'

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
      }
    })()

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])

  return <div ref={containerRef} className={className ?? 'fixed inset-0 h-svh w-svw'} />
}
