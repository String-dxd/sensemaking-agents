import { Check, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { WorldIconButton } from '~/components/student-space/hud/StudentSpaceHud'
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

const FIRST_ARRANGE_TOAST_KEY = 'ss:arrange:firstEntry:v1'

export function IslandProgressionOverlay({ game }: { game: Game }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [editMode, setEditMode] = useState(false)

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

  const toggleEditMode = () => {
    setEditMode((prev) => {
      const next = !prev
      window.dispatchEvent(new CustomEvent('ss:edit-mode', { detail: { on: next } }))
      if (next) {
        // One-time per-session discoverability toast on first entry.
        // sessionStorage failure (Safari private) is a silent skip — the
        // banner still teaches the feature.
        try {
          if (!window.sessionStorage.getItem(FIRST_ARRANGE_TOAST_KEY)) {
            window.sessionStorage.setItem(FIRST_ARRANGE_TOAST_KEY, '1')
            const toast: Toast = {
              id: Date.now(),
              text: 'Drag any of your things to plant them somewhere new.',
              variant: 'ready',
            }
            setToasts((current) => [...current, toast])
            window.setTimeout(() => {
              setToasts((current) => current.filter((t) => t.id !== toast.id))
            }, TOAST_TTL_MS + 1200)
          }
        } catch (_) {
          /* sessionStorage blocked — banner is enough */
        }
      }
      return next
    })
  }

  return (
    <div
      // The overlay layer covers the world FRAME (not the full viewport) so
      // absolutely-positioned chips inside the overlay anchor to the same
      // rounded surface the canvas lives in. Anchoring to the viewport
      // instead would push the Arrange button + toast stack into the
      // parchment surround below the frame — which was the source of the
      // "weird white strip" at the bottom of the page.
      style={{
        position: 'fixed',
        top: 'var(--frame-inset, 0px)',
        right: 'var(--frame-inset, 0px)',
        bottom: 'var(--frame-inset, 0px)',
        left: 'calc(var(--rail-width, 0px) + var(--frame-inset, 0px))',
        pointerEvents: 'none',
        zIndex: 22,
      }}
      data-island-progression-overlay
    >
      {editMode ? (
        <div
          // Persistent banner while edit mode is on. Top-center, above
          // the canvas but below any modal sheet (z=22 matches the
          // parent overlay). pointer-events: none so it doesn't catch
          // taps meant for the canvas — the toggle button below is
          // the only interactive element of arrange mode.
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(36, 56, 30, 0.88)',
            color: '#FFFBE6',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.2,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
            pointerEvents: 'none',
          }}
        >
          Arranging your island — tap Done when finished.
        </div>
      ) : null}

      <WorldIconButton
        onClick={toggleEditMode}
        pressed={editMode}
        label={editMode ? 'Finish arranging' : 'Arrange island'}
        className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] left-[18px] pointer-events-auto"
        data-arrange-toggle
      >
        {editMode ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Pencil aria-hidden="true" className="size-4" />
        )}
      </WorldIconButton>

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
