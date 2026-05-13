import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
import { X } from 'lucide-react'
import type { ComponentProps, HTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

/**
 * Bottom-sheet drawer built on Base UI Dialog. Slides up from the bottom
 * of the viewport, locks scroll, traps focus, dismisses on Escape and
 * backdrop click. Behavior the parent used to hand-roll lives in
 * Base UI's Dialog primitive.
 */
export const Drawer = BaseDialog.Root
export const DrawerTrigger = BaseDialog.Trigger
export const DrawerClose = BaseDialog.Close
export const DrawerPortal = BaseDialog.Portal

export function DrawerOverlay({ className, ...props }: ComponentProps<typeof BaseDialog.Backdrop>) {
  return (
    <BaseDialog.Backdrop
      data-testid="drawer-overlay"
      className={cn(
        'fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-200 ease-out',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

export interface DrawerContentProps extends ComponentProps<typeof BaseDialog.Popup> {
  closeLabel?: string
  showClose?: boolean
}

export function DrawerContent({
  className,
  children,
  closeLabel = 'Close',
  showClose = true,
  ...props
}: DrawerContentProps) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <BaseDialog.Popup
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[82vh] w-full max-w-5xl flex-col gap-3',
          'rounded-t-[28px] border border-border bg-background p-5 shadow-2xl sm:p-6',
          'transition-transform duration-200 ease-out',
          'data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-center">
          <span
            aria-hidden
            data-testid="drawer-grabber"
            className="h-1.5 w-12 rounded-full bg-muted-foreground/30"
          />
        </div>
        {showClose ? (
          <BaseDialog.Close
            aria-label={closeLabel}
            data-testid="drawer-close"
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X aria-hidden className="size-4" />
          </BaseDialog.Close>
        ) : null}
        <div className="flex-1 overflow-y-auto pt-4">{children}</div>
      </BaseDialog.Popup>
    </DrawerPortal>
  )
}

export function DrawerHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />
}

export function DrawerTitle({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn('text-base font-semibold leading-tight', className)}
      {...props}
    />
  )
}

export function DrawerDescription({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}
