import { X } from 'lucide-react'
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { useEffect } from 'react'
import { usePageEnterState } from '~/lib/student-space/use-page-enter-state'
import { cn } from '~/lib/utils'

export const studentSpaceFrameClassName =
  'top-(--inset-frame) right-(--inset-frame) bottom-(--inset-frame) left-[calc(var(--width-rail)+var(--inset-frame))] max-[640px]:left-(--inset-frame) max-[640px]:bottom-[calc(var(--inset-frame)+4.25rem)]'

export const studentSpaceFrameContainerClassName =
  'rounded-(--radius-frame) border border-(--color-frame-border) shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]'

/**
 * Full-viewport routed page surface. Plain framed div — not a Base UI Dialog.
 * Each routed page (History, Profile, Letters, Trajectory, Settings) is its
 * own surface that sits above the (hidden) world canvas. There is no portal
 * remount on navigation, so swapping page → page is a normal React subtree
 * swap with no opacity-0 starting style.
 *
 * Layout shape (mirrors the old SheetSurface internals):
 *
 *   <PageSurface>
 *     <SheetSidebar>
 *       <SheetIdentityHeader />
 *       <SheetSidenav />
 *     </SheetSidebar>
 *     <SheetContent>
 *       <SheetPageHeader />
 *       <SheetBody>{...}</SheetBody>
 *     </SheetContent>
 *   </PageSurface>
 *
 * Capture surfaces (Ask/Mood) continue to use `<Drawer>`.
 */
export interface PageSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  framed?: boolean
}

export function PageSurface({ className, children, framed = true, ...props }: PageSurfaceProps) {
  const enterState = usePageEnterState()
  return (
    <div
      data-testid="page-surface"
      data-fresh-enter={enterState === 'fresh' ? 'true' : undefined}
      className={cn(
        'fixed z-30 text-(--color-sheet-ink)',
        framed ? studentSpaceFrameClassName : 'inset-0',
        className,
      )}
      {...props}
    >
      <div
        data-testid="page-container"
        className={cn(
          'flex h-full w-full overflow-hidden bg-(--color-sheet-bg)',
          framed ? studentSpaceFrameContainerClassName : 'rounded-none',
        )}
      >
        {children}
      </div>
    </div>
  )
}

export interface PageCloseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string
}

export function PageCloseButton({ label = 'Close', className, ...props }: PageCloseButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid="page-close"
      className={cn(
        'absolute right-4 top-4 z-10 inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-(--color-sheet-ink-soft) transition-[transform,background-color,color] duration-(--duration-fast) ease-(--ease-out) active:scale-[0.96] motion-reduce:active:scale-100 hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
      {...props}
    >
      <X aria-hidden className="size-4" />
    </button>
  )
}

export function usePageEscape(onEscape: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape])
}

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
        'text-[13px] font-medium leading-snug text-(--color-sheet-ink-soft)',
        className,
      )}
      {...props}
    />
  )
}

export function SheetTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        'text-[clamp(1.5rem,3.6vw,2rem)] font-semibold leading-tight tracking-[-0.015em] text-(--color-sheet-ink)',
        className,
      )}
      {...props}
    />
  )
}

export function SheetDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-base leading-relaxed text-(--color-sheet-ink-soft)', className)}
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

export interface SheetNavButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export function SheetNavButton({
  active = false,
  className,
  children,
  ...props
}: SheetNavButtonProps) {
  return (
    <button
      type="button"
      data-active={active || undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-[transform,background-color,color] duration-(--duration-fast) ease-(--ease-out) active:scale-[0.97] motion-reduce:active:scale-100',
        'cursor-pointer text-(--color-sheet-ink-soft) hover:bg-[rgba(43,38,32,0.045)]',
        'data-[active]:bg-(--color-sheet-tab-active) data-[active]:text-(--color-sheet-ink)',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
