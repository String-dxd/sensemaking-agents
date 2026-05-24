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
  fullBleed?: boolean
  /** Render as a small floating popup near the bottom-center instead of a full-width bottom sheet. */
  popup?: boolean
}

export function DrawerContent({
  className,
  children,
  closeLabel = 'Close',
  showClose = true,
  fullBleed = false,
  popup = false,
  ...props
}: DrawerContentProps) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <BaseDialog.Popup
        className={cn(
          popup
            ? 'fixed inset-x-[max(18px,8vw)] bottom-6 z-50 mx-auto flex max-h-[min(640px,calc(100vh-7rem))] max-w-xl flex-col gap-3 rounded-3xl border border-border bg-background p-5 shadow-2xl'
            : 'fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[82vh] w-full max-w-5xl flex-col gap-3 rounded-t-[28px] border border-border bg-background p-5 shadow-2xl sm:p-6',
          fullBleed && 'gap-0 overflow-hidden p-0 sm:p-0',
          'transition-[transform,opacity] duration-200 ease-out',
          popup
            ? 'data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0'
            : 'data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
          className,
        )}
        {...props}
      >
        {popup ? null : (
          <div
            className={cn(
              'flex items-center justify-center',
              fullBleed && 'pointer-events-none absolute inset-x-0 top-4 z-10',
            )}
          >
            <span
              aria-hidden
              data-testid="drawer-grabber"
              className="h-1.5 w-12 rounded-full bg-muted-foreground/30"
            />
          </div>
        )}
        {showClose ? (
          <BaseDialog.Close
            aria-label={closeLabel}
            data-testid="drawer-close"
            className={cn(
              'absolute right-3 top-3 inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]',
              fullBleed && 'z-10 bg-background/70 backdrop-blur',
            )}
          >
            <X aria-hidden className="size-4" />
          </BaseDialog.Close>
        ) : null}
        <div className={cn('flex-1 overflow-y-auto pt-4', fullBleed && 'pt-0', popup && 'pt-0')}>
          {children}
        </div>
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
