import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
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
 * Lightweight modal confirm. Used by the library overview's "Run sense-making"
 * weak-corpus warning (R24 / AE5). Built on Base UI AlertDialog via the
 * shadcn wrapper in `src/components/ui/alert-dialog.tsx` — focus trap,
 * Escape close, scroll lock, and aria-modal are handled by Base UI.
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
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Only treat close transitions as cancel when the parent still
        // thinks the dialog is open. Without this guard, Base UI fires
        // `onOpenChange(false)` after `onConfirm` flips `open` to false,
        // which would re-enter `onCancel` and double-fire the mutation.
        if (!nextOpen && open) onCancel()
      }}
    >
      <AlertDialogContent data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle data-testid="confirm-dialog-title">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription data-testid="confirm-dialog-description">
              {description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button size="sm" variant="ghost" onClick={onCancel} data-testid="confirm-dialog-cancel">
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
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
