import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Game } from '~/engine/student-space/Game'

/**
 * U6 — small React overlay above the engine canvas. Two responsibilities:
 *
 *  1. **Tray** — a bottom-center pill showing the count of bloom-ready
 *     sprouts. Hidden when none. Clicking the tray is informational only
 *     (the visible sprout pulse is the actual CTA — see View/Sprouts.js);
 *     the tray provides a global affordance for students whose camera is
 *     facing away from the ready sprouts.
 *  2. **Toasts** — transient reflection-voice messages on grow / spawn /
 *     markedReady / bloomed events. Auto-dismiss after 2.4s. Stack near
 *     the tray.
 *
 * Position chosen to avoid colliding with `zoom-hud` (bottom-right) and
 * `mood-hud` (bottom-center). The tray sits *above* the mood-hud band
 * so neither overlaps.
 *
 * useSyncExternalStore is called twice — once for the ready-sprouts
 * count snapshot, once for live event subscription that produces toasts.
 * Both anchor on Game.state.sprouts.subscribe; the Sprouts slice's
 * recent()/getActive() return referentially-stable snapshots between
 * mutations so React's getSnapshot contract holds.
 */

type Toast = {
  id: number
  text: string
  variant: 'grow' | 'ready' | 'bloom'
}

const TOAST_TTL_MS = 2400

type SproutSnapshot = {
  readyCount: number
  activeCount: number
}

function getSproutsSlice(game: Game) {
  // Defensive: tests sometimes pass a partial game without a state surface.
  // Real engine boots always have state.sprouts; partial mocks must not crash.
  const state = (
    game as unknown as {
      state?: {
        sprouts?: {
          readyToBloom?(): readonly unknown[]
          recent?(n: number): readonly unknown[]
          subscribe?(cb: (event: { type: string }) => void): () => void
        }
      }
    }
  ).state
  return state?.sprouts ?? null
}

function buildSnapshot(game: Game): SproutSnapshot {
  const sprouts = getSproutsSlice(game)
  if (!sprouts?.readyToBloom || !sprouts.recent) {
    return { readyCount: 0, activeCount: 0 }
  }
  return {
    readyCount: sprouts.readyToBloom().length,
    activeCount: sprouts.recent(50).length,
  }
}

const snapshotCache = new WeakMap<Game, SproutSnapshot>()

function getSnapshot(game: Game): SproutSnapshot {
  // useSyncExternalStore requires a stable reference until subscribe
  // signals a change. The Sprouts slice already returns stable arrays;
  // we cache the wrapper object too so React's referential check
  // short-circuits on no-op rerenders.
  const cached = snapshotCache.get(game)
  if (cached !== undefined) {
    const next = buildSnapshot(game)
    if (cached.readyCount === next.readyCount && cached.activeCount === next.activeCount) {
      return cached
    }
    snapshotCache.set(game, next)
    return next
  }
  const fresh = buildSnapshot(game)
  snapshotCache.set(game, fresh)
  return fresh
}

function subscribe(game: Game, onStoreChange: () => void): () => void {
  const sprouts = getSproutsSlice(game)
  if (!sprouts?.subscribe) return () => {}
  return sprouts.subscribe(() => {
    snapshotCache.delete(game)
    onStoreChange()
  })
}

export function IslandProgressionOverlay({ game }: { game: Game }) {
  const snapshot = useSyncExternalStore(
    (onChange) => subscribe(game, onChange),
    () => getSnapshot(game),
    () => ({ readyCount: 0, activeCount: 0 }), // SSR fallback
  )

  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let nextId = 1
    const sprouts = getSproutsSlice(game)
    if (!sprouts?.subscribe) return
    const unsubscribe = sprouts.subscribe((event) => {
      let entry: Toast | null = null
      if (event.type === 'spawned') {
        entry = {
          id: nextId++,
          text: 'Heard. Something is growing on the island.',
          variant: 'grow',
        }
      } else if (event.type === 'grew') {
        entry = { id: nextId++, text: 'Heard. The sprout grew.', variant: 'grow' }
      } else if (event.type === 'markedReady') {
        entry = { id: nextId++, text: 'This one’s ready to plant.', variant: 'ready' }
      } else if (event.type === 'bloomed') {
        entry = { id: nextId++, text: 'Planted. A new tree on the island.', variant: 'bloom' }
      }
      if (entry) {
        const fresh: Toast = entry
        setToasts((prev) => [...prev, fresh])
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== fresh.id))
        }, TOAST_TTL_MS)
      }
    })
    return unsubscribe
  }, [game])

  return (
    <div
      // The overlay layer covers the viewport so absolutely-positioned
      // chips inside can anchor relative to it without touching the engine
      // canvas. `pointer-events: none` so trace clicks fall through to the
      // canvas by default; the tray button opts in to pointer events.
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 22,
      }}
      data-island-progression-overlay
    >
      {snapshot.readyCount > 0 ? (
        <div
          role="status"
          aria-label={`Ready to plant: ${snapshot.readyCount} sprouts`}
          style={{
            position: 'absolute',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)', // above mood-hud band
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '7px 14px',
            borderRadius: 999,
            background: 'rgba(255, 251, 230, 0.95)',
            color: '#1a3a14',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.18)',
            pointerEvents: 'auto',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#FFB347',
              boxShadow: '0 0 6px rgba(255, 179, 71, 0.7)',
            }}
          />
          Ready to plant · {snapshot.readyCount}
        </div>
      ) : null}

      <section
        // Toast stack — bottom-center, just above the tray slot.
        aria-live="polite"
        aria-label="Island progression updates"
        style={{
          position: 'absolute',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 132px)',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 6,
          maxWidth: 'min(90vw, 360px)',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '6px 12px',
              borderRadius: 12,
              background: 'rgba(20, 28, 18, 0.86)',
              color: '#FFFBE6',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 12,
              lineHeight: 1.3,
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
              pointerEvents: 'none',
            }}
          >
            {t.text}
          </div>
        ))}
      </section>
    </div>
  )
}
