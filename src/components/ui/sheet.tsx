import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
import { X } from 'lucide-react'
import type { ComponentProps, HTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

/**
 * Full-viewport routed-page sheet primitive. Built on Base UI Dialog with
 * `modal={false}` so the world canvas behind isn't aria-hidden — routed pages
 * pause the rAF loop separately (PR #32), and the sheet itself owns its own
 * opaque surface.
 *
 * Layout shape (PR #33 two-pane split):
 *
 *   <Sheet open>
 *     <SheetSidebar>
 *       <SheetIdentityHeader />
 *       <SheetSidenav />
 *     </SheetSidebar>
 *     <SheetContent>
 *       <SheetPageHeader />
 *       <SheetBody>{...}</SheetBody>
 *     </SheetContent>
 *   </Sheet>
 *
 * Replaces `src/engine/student-space/Game/View/SheetChrome.js` for routed
 * pages. Capture sheets (Ask/Mood) continue to use `<Drawer>`.
 */
export const Sheet = BaseDialog.Root
export const SheetTrigger = BaseDialog.Trigger
export const SheetClose = BaseDialog.Close
export const SheetPortal = BaseDialog.Portal

export function SheetBackdrop({ className, ...props }: ComponentProps<typeof BaseDialog.Backdrop>) {
  return (
    <BaseDialog.Backdrop
      data-testid="sheet-backdrop"
      className={cn(
        'fixed inset-0 z-40 bg-transparent transition-opacity duration-(--duration-sheet) ease-(--ease-sheet)',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

export interface SheetContentRootProps extends ComponentProps<typeof BaseDialog.Popup> {
  /** Render the × close button. Routed sheets without a back-affordance disable this. */
  showClose?: boolean
  closeLabel?: string
  /** Position inside the world frame (the rounded recessed surface). Default. */
  framed?: boolean
}

/**
 * The visible sheet surface. Positions inside the world frame by default
 * (top/right/bottom inset by `--inset-frame`, left offset by rail + frame
 * inset), with the frame's rounded corner shape.
 */
export function SheetSurface({
  className,
  children,
  showClose = false,
  closeLabel = 'Close',
  framed = true,
  ...props
}: SheetContentRootProps) {
  return (
    <SheetPortal>
      <SheetBackdrop />
      <BaseDialog.Popup
        data-testid="sheet-surface"
        className={cn(
          'fixed z-50 flex overflow-hidden bg-(--color-sheet-bg) text-(--color-sheet-ink)',
          framed
            ? 'top-(--inset-frame) right-(--inset-frame) bottom-(--inset-frame) left-[calc(var(--width-rail)+var(--inset-frame))] rounded-(--radius-frame)'
            : 'inset-0',
          'transition-opacity duration-(--duration-sheet) ease-(--ease-sheet)',
          'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <BaseDialog.Close
            aria-label={closeLabel}
            data-testid="sheet-close"
            className="absolute right-4 top-4 z-10 inline-flex size-9 items-center justify-center rounded-full text-(--color-sheet-ink-soft) transition-colors hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X aria-hidden className="size-4" />
          </BaseDialog.Close>
        ) : null}
      </BaseDialog.Popup>
    </SheetPortal>
  )
}

/** Left pane — sidebar nav. ~360px fixed width, low-alpha cream wash. */
export function SheetSidebar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <aside
      data-testid="sheet-sidebar"
      className={cn(
        'flex w-[360px] shrink-0 flex-col overflow-y-auto border-r border-(--color-sheet-divider) bg-(--color-sheet-pane-left)',
        className,
      )}
      {...props}
    />
  )
}

/** Right pane — page content. Flex 1; container for page header + body. */
export function SheetContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-testid="sheet-content"
      className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', className)}
      {...props}
    />
  )
}

export function SheetIdentityHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-3 px-7 py-10', className)} {...props} />
}

export function SheetSidenav({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <nav
      data-testid="sheet-sidenav"
      className={cn('flex flex-col gap-1 px-4 pb-6', className)}
      {...props}
    />
  )
}

export function SheetPageHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <header
      data-testid="sheet-page-header"
      className={cn(
        'flex flex-col gap-1.5 border-b border-(--color-sheet-divider) px-9 pt-12 pb-6',
        className,
      )}
      {...props}
    />
  )
}

export function SheetEyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)',
        className,
      )}
      {...props}
    />
  )
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn(
        'text-[clamp(1.5rem,3.6vw,2rem)] font-semibold leading-tight tracking-tight text-(--color-sheet-ink)',
        className,
      )}
      {...props}
    />
  )
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn('text-sm leading-relaxed text-(--color-sheet-ink-soft)', className)}
      {...props}
    />
  )
}

export function SheetBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-testid="sheet-body"
      className={cn('relative min-h-px flex-1 overflow-y-auto px-9 py-8', className)}
      {...props}
    />
  )
}
