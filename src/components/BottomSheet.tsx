import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { cn } from '~/lib/utils'

const TRANSITION_MS = 200

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
 * Minimal bottom-sheet drawer. Controlled by `open`. Renders a fixed-
 * position panel anchored to the bottom of the viewport occupying the
 * lower ~60-70% when open, fully off-screen when closed via
 * `transform: translateY(100%)`. Closes on close-X click, backdrop
 * click, or Escape. Focuses the close button on open.
 *
 * No gestures, no physics, no scroll-snap this plan — only the cheapest
 * possible slide-up transition that prevents snap-blink on tap. Polish
 * (gesture-driven drag, springs) lands later without changing the
 * consumer API.
 */
export function BottomSheet({
  open,
  onOpenChange,
  closeLabel = 'Close',
  id,
  children,
}: BottomSheetProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId()
  const panelId = id ?? `bottom-sheet-${generatedId}`

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <div
      data-testid="bottom-sheet"
      data-state={open ? 'open' : 'closed'}
      aria-hidden={!open}
      className={cn('pointer-events-none fixed inset-0 z-40', open ? 'pointer-events-auto' : null)}
    >
      <button
        type="button"
        aria-label={closeLabel}
        tabIndex={-1}
        onClick={() => onOpenChange(false)}
        data-testid="bottom-sheet-backdrop"
        className={cn(
          'absolute inset-0 cursor-default bg-foreground/40 transition-opacity ease-out',
          open ? 'opacity-100' : 'opacity-0',
        )}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      />
      <section
        role="dialog"
        aria-modal="true"
        id={panelId}
        className={cn(
          'absolute inset-x-0 bottom-0 mx-auto flex h-[70vh] w-full max-w-3xl flex-col gap-3',
          'rounded-t-2xl border border-border bg-background p-4 shadow-2xl',
          'transition-transform ease-out',
        )}
        style={{
          transitionDuration: `${TRANSITION_MS}ms`,
          transform: open ? 'translateY(0)' : 'translateY(100%)',
        }}
        data-testid="bottom-sheet-panel"
      >
        <div className="flex items-center justify-between">
          <span
            aria-hidden
            data-testid="bottom-sheet-grabber"
            className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30"
          />
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={closeLabel}
          data-testid="bottom-sheet-close"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
        <div className="flex-1 overflow-y-auto pt-4">{children}</div>
      </section>
    </div>
  )
}
