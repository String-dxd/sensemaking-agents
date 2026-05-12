import { forwardRef, type ReactNode } from 'react'
import { cn } from '~/lib/utils'

export interface WorldStageProps {
  /** HUD content rendered above the stage (Studio pill, Voice button, etc.). */
  children?: ReactNode
  /** Optional extra classes for the stage root. */
  className?: string
}

/**
 * Placeholder world-stage surface. Renders a solid color with a quiet
 * label as a clearly non-final visual; the real threejs scene replaces
 * the internals in a follow-up plan without changing this component's
 * external API.
 *
 * The forwarded ref points at the stage root so a future canvas mount has
 * a stable target. Empty in this plan.
 */
export const WorldStage = forwardRef<HTMLDivElement, WorldStageProps>(function WorldStage(
  { children, className },
  ref,
) {
  return (
    <div
      ref={ref}
      data-testid="world-stage"
      data-placeholder="true"
      className={cn(
        'relative isolate w-full overflow-hidden rounded-2xl border border-border/40',
        'min-h-[60vh] bg-muted',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground/60"
      >
        world
      </span>
      {children}
    </div>
  )
})
