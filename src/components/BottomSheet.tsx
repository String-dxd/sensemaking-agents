import { type ReactNode, useId } from 'react'
import { Drawer, DrawerContent } from '~/components/ui/drawer'

export interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible label for the close button; defaults to "Close". */
  closeLabel?: string
  /** Optional id forwarded to the sheet panel for aria-controls. */
  id?: string
  children?: ReactNode
}

/**
 * Bottom-sheet drawer wrapped around the shadcn-style Drawer primitive
 * (Base UI Dialog under the hood). Focus trap, Escape close, scroll
 * lock, backdrop click, and slide-up animation are handled by Base UI.
 */
export function BottomSheet({
  open,
  onOpenChange,
  closeLabel = 'Close',
  id,
  children,
}: BottomSheetProps) {
  const generatedId = useId()
  const panelId = id ?? `bottom-sheet-${generatedId}`

  return (
    <Drawer open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <DrawerContent
        id={panelId}
        closeLabel={closeLabel}
        data-testid="bottom-sheet-panel"
        aria-label="Sheet"
      >
        {children}
      </DrawerContent>
    </Drawer>
  )
}
