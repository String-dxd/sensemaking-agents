import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
import { X } from 'lucide-react'
import type { ComponentProps, HTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

/**
 * Drawer built on Base UI Dialog. Slides in from a configurable edge,
 * locks scroll, traps focus, dismisses on Escape and backdrop click.
 *
 * `side="bottom"` (default) — full-width bottom sheet with grabber + close.
 *   Used by capture surfaces (AskSheet, MoodSheet).
 * `side="left"` — left-anchored full-height nav drawer. No grabber, no
 *   close button by default; primary dismiss is backdrop click or
 *   selecting an item. Used by mobile navigation.
 * `popup` — small floating popup near bottom-center. Overrides `side`.
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

export type DrawerSide = 'bottom' | 'left'

export interface DrawerContentProps extends ComponentProps<typeof BaseDialog.Popup> {
  closeLabel?: string
  showClose?: boolean
  fullBleed?: boolean
  /** Edge the drawer slides in from. Ignored when `popup` is true. */
  side?: DrawerSide
  /** Render as a small floating popup near the bottom-center instead of a full-width bottom sheet. */
  popup?: boolean
  /** Keep focus/dismiss behavior without drawing the dimmed backdrop. */
  hideOverlay?: boolean
}

const SIDE_POSITION: Record<DrawerSide, string> = {
  bottom:
    'fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[82vh] w-full max-w-5xl flex-col gap-3 rounded-t-[28px] border border-border bg-background p-5 shadow-2xl sm:p-6',
  left: 'fixed inset-y-0 left-0 z-50 flex h-full w-[82vw] max-w-sm flex-col gap-3 rounded-r-[28px] border border-border bg-background p-5 shadow-2xl',
}

const SIDE_ANIMATION: Record<DrawerSide, string> = {
  bottom: 'data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
  left: 'data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full',
}

export function DrawerContent({
  className,
  children,
  closeLabel = 'Close',
  showClose,
  fullBleed = false,
  side = 'bottom',
  popup = false,
  hideOverlay = false,
  ...props
}: DrawerContentProps) {
  // Bottom drawers default to showing close; left drawers default to no
  // close (item-tap or backdrop is the primary dismiss). `showClose` prop
  // overrides per-instance.
  const effectiveShowClose = showClose ?? side === 'bottom'
  return (
    <DrawerPortal>
      {hideOverlay ? null : <DrawerOverlay />}
      <BaseDialog.Popup
        className={cn(
          popup
            ? 'fixed inset-x-[max(18px,8vw)] bottom-6 z-50 mx-auto flex max-h-[min(640px,calc(100vh-7rem))] max-w-xl flex-col gap-3 rounded-3xl border border-border bg-background p-5 shadow-2xl'
            : SIDE_POSITION[side],
          fullBleed && 'gap-0 overflow-hidden p-0 sm:p-0',
          'transition-[transform,opacity] duration-200 ease-out',
          popup
            ? 'data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0'
            : SIDE_ANIMATION[side],
          className,
        )}
        {...props}
      >
        {popup || side !== 'bottom' ? null : (
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
        {effectiveShowClose ? (
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
        <div
          className={cn(
            'flex-1 overflow-y-auto pt-4',
            (fullBleed || popup || side !== 'bottom') && 'pt-0',
          )}
        >
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
