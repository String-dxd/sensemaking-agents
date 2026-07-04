// Minimal toast queue (plan 012 step 1) — the shell's one place to surface
// store/runtime errors that would otherwise only be a `console.error`, e.g.
// plan-009's sculptDelta `baseMeshVersion` mismatch (CharacterRoot.tsx) and
// plan-012's own corrupt-`.character.json`-import error (rosterStore.ts).
//
// `pushToast` is a plain function (not a hook) so ANY module — core-adjacent
// viewport code, zustand stores, event handlers — can surface a toast
// without being a React component. Mirrors the `studioCommands` /
// `useMotionStudio` "singleton store, call from anywhere" idiom already used
// throughout `src/studio/state/*`.

import { create } from 'zustand'

export type ToastKind = 'info' | 'warning' | 'error'

export interface ToastMessage {
  id: number
  kind: ToastKind
  text: string
}

interface ToastState {
  toasts: ToastMessage[]
  dismiss(id: number): void
}

const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  info: 4000,
  warning: 6000,
  error: 9000,
}

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Push a toast from anywhere in the studio. Auto-dismisses after a
 * kind-dependent delay; the user can also close it early. Returns the toast
 * id (callers rarely need it — mostly useful for tests). */
export function pushToast(text: string, kind: ToastKind = 'info'): number {
  const id = nextId++
  useToastStore.setState((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
  if (typeof window !== 'undefined') {
    window.setTimeout(() => useToastStore.getState().dismiss(id), AUTO_DISMISS_MS[kind])
  }
  return id
}

const KIND_ACCENT: Record<ToastKind, string> = {
  info: 'var(--cs-accent)',
  warning: 'var(--cs-warn)',
  error: 'var(--cs-danger)',
}

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="cs-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="cs-toast" style={{ borderLeftColor: KIND_ACCENT[t.kind] }}>
          <span className="cs-toast__text">{t.text}</span>
          <button type="button" className="cs-toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
