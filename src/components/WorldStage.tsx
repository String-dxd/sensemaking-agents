import { forwardRef, type ReactNode } from 'react'
import { cn } from '~/lib/utils'

export interface WorldStageProps {
  /** HUD content rendered above the stage (Studio pill, Voice button, etc.). */
  children?: ReactNode
  /** Optional extra classes for the stage root. */
  className?: string
}

/**
 * Placeholder world-stage surface. Renders a sky gradient + a static SVG
 * island silhouette as a clearly non-final visual; the real threejs scene
 * replaces the internals in a follow-up plan without changing this
 * component's external API.
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
        'min-h-[60vh] bg-gradient-to-b from-sky-100 via-sky-50 to-amber-50',
        'dark:from-slate-900 dark:via-slate-800 dark:to-slate-700',
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <title>placeholder world scene</title>
        <ellipse cx="300" cy="320" rx="220" ry="48" fill="currentColor" opacity="0.08" />
        <ellipse cx="300" cy="300" rx="180" ry="36" fill="currentColor" opacity="0.14" />
        <path
          d="M250 300 L260 230 Q265 215 280 220 Q280 200 295 205 Q300 185 310 200 Q320 185 325 205 Q345 205 340 220 Q350 230 340 240 L335 300 Z"
          fill="currentColor"
          opacity="0.22"
        />
        <circle cx="305" cy="215" r="4" fill="currentColor" opacity="0.45" />
      </svg>
      {children}
    </div>
  )
})
