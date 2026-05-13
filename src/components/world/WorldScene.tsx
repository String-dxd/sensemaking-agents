import { useEffect, useMemo, useRef, useState } from 'react'
import { createWorldScene } from './createWorldScene'
import type { VipsWorldSceneModel } from './vipsWorldMapping'
import { buildVipsWorldSceneModel } from './vipsWorldMapping'

export interface WorldSceneProps {
  model?: VipsWorldSceneModel
  reduceMotion?: boolean
}

export function WorldScene({ model, reduceMotion }: WorldSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const sceneModel = useMemo(() => model ?? buildVipsWorldSceneModel(), [model])

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
      })
      return () => handle.dispose()
    } catch {
      setFailed(true)
    }
  }, [sceneModel, reduceMotion])

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      data-testid="world-scene-host"
      data-world-scene-state={failed ? 'fallback' : 'mounted'}
    >
      {failed ? <WorldSceneFallback model={sceneModel} /> : null}
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
