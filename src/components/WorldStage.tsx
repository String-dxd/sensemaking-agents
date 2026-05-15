import { forwardRef, type ReactNode } from 'react'
import { cn } from '~/lib/utils'
import type { WorldHotspot } from './world/hotspots'
import type { VipsWorldSceneModel } from './world/vipsWorldMapping'
import { WorldScene, type WorldSceneInteractionEvent } from './world/WorldScene'
import type { WorldEnvironmentControls } from './world/worldStyle'

export interface WorldStageProps {
  /** HUD content rendered above the stage (Studio pill, Voice button, etc.). */
  children?: ReactNode
  /** Optional extra classes for the stage root. */
  className?: string
  /** Triggered when the prompt bird is selected. */
  onVoicePromptSelect?: () => void
  /** Lets TanStack routes handle world hotspot links without a page reload. */
  onHotspotNavigate?: (href: string, hotspot: WorldHotspot) => void
  /** Backend-ready seam for future world interaction analytics/wiring. */
  onWorldInteraction?: (event: WorldSceneInteractionEvent) => void
  /** Plain scene descriptor rendered by the decorative Three.js layer. */
  sceneModel?: VipsWorldSceneModel
  /** Student Space-inspired time and weather controls for the scene layer. */
  environmentControls?: WorldEnvironmentControls
}

/**
 * World-stage surface. Three.js owns only the decorative island layer;
 * React children remain the actionable HUD above it.
 */
export const WorldStage = forwardRef<HTMLDivElement, WorldStageProps>(function WorldStage(
  {
    children,
    className,
    environmentControls,
    onHotspotNavigate,
    onVoicePromptSelect,
    onWorldInteraction,
    sceneModel,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      data-testid="world-stage"
      data-placeholder="false"
      data-fullscreen="true"
      className={cn(
        'relative isolate w-full overflow-hidden',
        'min-h-svh bg-transparent',
        className,
      )}
    >
      <WorldScene
        environmentControls={environmentControls}
        model={sceneModel}
        onHotspotNavigate={onHotspotNavigate}
        onVoicePromptSelect={onVoicePromptSelect}
        onWorldInteraction={onWorldInteraction}
      />
      <div className="pointer-events-none absolute inset-0 z-10">{children}</div>
    </div>
  )
})
