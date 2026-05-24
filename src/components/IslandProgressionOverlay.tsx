import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast as sonnerToast, Toaster } from 'sonner'
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
 * Sonner owns the toast stack; this component only bridges world events to
 * top-screen notifications and keeps the arrange toggle in the frame overlay.
 */

const TOAST_TTL_MS = 2400
const PROGRESSION_TOAST_ID = 'student-space-progression'

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

function showProgressionToast(text: string, duration = Infinity) {
  sonnerToast.custom(
    (id) => (
      <div className="pointer-events-auto flex w-[min(90vw,380px)] items-center justify-between gap-3 rounded-2xl bg-[rgba(20,28,18,0.92)] px-3.5 py-2.5 text-xs font-medium text-[#fffbe6] shadow-[0_10px_30px_rgba(0,0,0,0.24)] backdrop-blur-md">
        <span className="min-w-0">{text}</span>
        <button
          type="button"
          aria-label="Dismiss update"
          onClick={() => sonnerToast.dismiss(id)}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-white/14 text-[#fffbe6] transition-colors hover:bg-white/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    ),
    { duration, id: PROGRESSION_TOAST_ID },
  )
}

export function IslandProgressionOverlay({ game }: { game: Game }) {
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    const sprouts = getSproutsSlice(game)
    if (!sprouts?.subscribe) return
    const unsubscribe = sprouts.subscribe((event) => {
      if (event.type === 'spawned') {
        showProgressionToast('Heard. Something is growing on the island.')
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
      showProgressionToast(`Still growing — ${count}/${threshold}.`, TOAST_TTL_MS)
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
            showProgressionToast(
              'Drag any of your things to plant them somewhere new.',
              TOAST_TTL_MS + 1200,
            )
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
      <Toaster
        position="top-center"
        expand
        visibleToasts={4}
        gap={8}
        offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}
        toastOptions={{ unstyled: true }}
      />
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
    </div>
  )
}
