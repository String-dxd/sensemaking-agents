import { useEffect, useState } from 'react'
import type { Game } from '~/engine/student-space/Game'

/**
 * U6 — small React overlay above the engine canvas. Surfaces transient
 * reflection-voice toasts on capture / grow / bloom events, plus the
 * "still growing" feedback for not-ready sprout taps.
 *
 * The "Ready to plant" tray was removed once auto-bloom-in-camera-moment
 * shipped: the camera flow itself is the celebration; the bloom happens
 * automatically when the threshold-crossing capture lands, so there's no
 * "ready and waiting" state for the student to discover.
 *
 * useSyncExternalStore is no longer needed since the only thing rendered
 * is the toast stack — toasts are local component state, driven directly
 * by the slice's subscribe callback inside useEffect.
 */

type Toast = {
  id: number
  text: string
  variant: 'grow' | 'ready' | 'bloom'
}

const TOAST_TTL_MS = 2400

function getSproutsSlice(game: Game) {
  // Defensive: tests sometimes pass a partial game without a state surface.
  // Real engine boots always have state.sprouts; partial mocks must not crash.
  const state = (
    game as unknown as {
      state?: {
        sprouts?: {
          subscribe?(cb: (event: { type: string }) => void): () => void
        }
      }
    }
  ).state
  return state?.sprouts ?? null
}

export function IslandProgressionOverlay({ game }: { game: Game }) {
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

    // Not-ready sprout taps come through a CustomEvent dispatched by the
    // engine's Sprouts view, NOT through the slice's subscriber chain
    // (the tap doesn't mutate slice state). Surface a brief "still
    // growing" toast so the tap doesn't feel ignored.
    const onNotReady = (e: Event) => {
      const ce = e as CustomEvent<{ count?: number; threshold?: number }>
      const count = ce.detail?.count ?? 0
      const threshold = ce.detail?.threshold ?? 0
      const tip: Toast = {
        id: nextId++,
        text: `Still growing — ${count}/${threshold}.`,
        variant: 'grow',
      }
      setToasts((prev) => [...prev, tip])
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== tip.id))
      }, TOAST_TTL_MS)
    }
    window.addEventListener('ss:sprout-tap-not-ready', onNotReady)

    return () => {
      unsubscribe()
      window.removeEventListener('ss:sprout-tap-not-ready', onNotReady)
    }
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
      <section
        // Toast stack — bottom-center, above the mood-hud band. Tray
        // removed in the auto-bloom rev so toasts move down to where the
        // tray used to be.
        aria-live="polite"
        aria-label="Island progression updates"
        style={{
          position: 'absolute',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
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
