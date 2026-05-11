import { useEffect, useRef } from 'react'
import { Button } from '~/components/ui/button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Optional visual emphasis for the confirm button. Defaults to 'default'. */
  confirmVariant?: 'default' | 'accent' | 'destructive'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Lightweight modal confirm. Used by the wiki overview's "Run sense-making"
 * weak-corpus warning (R24 / AE5) — and by VipsPageView's per-entry forget
 * inline confirm pattern lives on its own (smaller, inline; not this).
 *
 * Plain DOM + tailwind because `src/components/ui/` has no Dialog primitive
 * yet. Pulling in shadcn's Dialog would mean adding `@radix-ui/react-dialog`
 * — out of scope for U9 given the dialog is a single yes/cancel surface.
 *
 * A11y: role=dialog + aria-modal, focuses the cancel button on open so
 * the destructive option is never the default-focused element, Esc closes.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  confirmVariant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    // Backdrop is decoration only — Escape closes (keyboard) and the
    // visible Cancel button stays in tab order. We deliberately avoid a
    // backdrop-click cancel because pairing onClick on a div with the
    // corresponding key handler would only mirror the Escape behavior
    // that's already in place.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      data-testid="confirm-dialog-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-background p-5 shadow-lg"
        data-testid="confirm-dialog"
      >
        <div className="flex flex-col gap-2">
          <h2
            id="confirm-dialog-title"
            className="text-base font-semibold leading-tight"
            data-testid="confirm-dialog-title"
          >
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground" data-testid="confirm-dialog-description">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            ref={cancelRef}
            size="sm"
            variant="ghost"
            onClick={onCancel}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            variant={confirmVariant}
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
