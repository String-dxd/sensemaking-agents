import { forwardRef, type ReactNode } from 'react'
import { cn } from '~/lib/utils'
import type { VipsWorldSceneModel } from './world/vipsWorldMapping'
import { WorldScene } from './world/WorldScene'

export interface WorldStageProps {
  /** HUD content rendered above the stage (Studio pill, Voice button, etc.). */
  children?: ReactNode
  /** Optional extra classes for the stage root. */
  className?: string
  /** Plain scene descriptor rendered by the decorative Three.js layer. */
  sceneModel?: VipsWorldSceneModel
}

/**
 * World-stage surface. Three.js owns only the decorative island layer;
 * React children remain the actionable HUD above it.
 */
export const WorldStage = forwardRef<HTMLDivElement, WorldStageProps>(function WorldStage(
  { children, className, sceneModel },
  ref,
) {
  return (
    <div
      ref={ref}
      data-testid="world-stage"
      data-placeholder="false"
      className={cn(
        'relative isolate w-full overflow-hidden rounded-[1.75rem] border border-border/40',
        'min-h-[56vh] bg-[#c7e3ee] sm:min-h-[60vh]',
        className,
      )}
    >
      <WorldScene model={sceneModel} />
      <div className="pointer-events-none absolute inset-0 z-10">{children}</div>
    </div>
  )
})
