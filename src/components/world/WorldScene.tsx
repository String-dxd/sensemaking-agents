import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWorldScene } from './createWorldScene'
import type { WorldHotspot, WorldHotspotPointer } from './hotspots'
import type { VipsWorldSceneModel } from './vipsWorldMapping'
import { buildVipsWorldSceneModel } from './vipsWorldMapping'

export interface WorldSceneProps {
  model?: VipsWorldSceneModel
  reduceMotion?: boolean
}

export function WorldScene({ model, reduceMotion }: WorldSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState<{
    hotspot: WorldHotspot
    pointer: WorldHotspotPointer
  } | null>(null)
  const sceneModel = useMemo(() => model ?? buildVipsWorldSceneModel(), [model])

  const handleHotspotHover = useCallback(
    (hotspot: WorldHotspot | null, pointer?: WorldHotspotPointer) => {
      setHovered(hotspot && pointer ? { hotspot, pointer } : null)
    },
    [],
  )

  const handleHotspotSelect = useCallback((hotspot: WorldHotspot) => {
    window.location.href = hotspot.href
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const prefersReducedMotion =
      reduceMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    setFailed(false)
    try {
      const handle = createWorldScene({
        container: host,
        model: sceneModel,
        reduceMotion: prefersReducedMotion,
        onHotspotHover: handleHotspotHover,
        onHotspotSelect: handleHotspotSelect,
      })
      return () => handle.dispose()
    } catch {
      setFailed(true)
    }
  }, [sceneModel, reduceMotion, handleHotspotHover, handleHotspotSelect])

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      data-testid="world-scene-host"
      data-world-scene-state={failed ? 'fallback' : 'mounted'}
    >
      {hovered ? (
        <WorldSceneHotspotTooltip hotspot={hovered.hotspot} pointer={hovered.pointer} />
      ) : null}
      {failed ? <WorldSceneFallback model={sceneModel} /> : null}
    </div>
  )
}

function WorldSceneHotspotTooltip({
  hotspot,
  pointer,
}: {
  hotspot: WorldHotspot
  pointer: WorldHotspotPointer
}) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 w-56 rounded-md border border-white/70 bg-background/90 px-3 py-2 text-left text-xs shadow-lg backdrop-blur"
      style={{
        left: `min(${Math.max(8, pointer.x + 14)}px, calc(100% - 15rem))`,
        top: `min(${Math.max(8, pointer.y + 14)}px, calc(100% - 6.5rem))`,
      }}
      data-testid="world-hotspot-tooltip"
      data-hotspot-kind={hotspot.kind}
    >
      <p className="font-semibold uppercase tracking-wide text-muted-foreground">
        {hotspot.eyebrow}
      </p>
      <p className="mt-1 font-medium text-foreground">{hotspot.title}</p>
      <p className="mt-1 text-muted-foreground">{hotspot.description}</p>
    </div>
  )
}

function WorldSceneFallback({ model }: { model: VipsWorldSceneModel }) {
  return (
    <div
      role="img"
      aria-label="A quiet island map of your current Values, Interests, Personality, Skills, and recent reflections."
      className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_42%,rgba(185,221,213,0.95),rgba(199,227,238,0.72)_38%,rgba(255,246,225,0.75)_72%)]"
      data-testid="world-scene-fallback"
    >
      <div
        aria-hidden
        className="h-36 w-56 rounded-[50%] border border-white/50 bg-[#94bf78] shadow-[0_20px_60px_rgba(53,84,70,0.22)]"
      />
      <span className="sr-only" data-testid="world-scene-fallback-summary">
        {model.summary.confirmedClaims} confirmed claims, {model.summary.pendingClaims} pending
        claims, {model.butterflies.length} recent reflections.
      </span>
    </div>
  )
}
