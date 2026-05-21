import { ArrowRight, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '~/lib/utils'
import { createWorldScene } from './createWorldScene'
import type { WorldHotspot, WorldHotspotPointer } from './hotspots'
import type { VipsWorldSceneModel } from './vipsWorldMapping'
import { buildVipsWorldSceneModel } from './vipsWorldMapping'
import type { WorldEnvironmentControls } from './worldStyle'

export type WorldSceneInteractionEvent =
  | { type: 'hotspot-hover'; hotspot: WorldHotspot | null }
  | { type: 'hotspot-select'; hotspot: WorldHotspot }
  | { type: 'narration-open'; hotspot: WorldHotspot }
  | { type: 'narration-close'; hotspot: WorldHotspot | null }
  | { type: 'narration-confirm'; hotspot: WorldHotspot }
  | { type: 'camera-control'; action: 'zoom-in' | 'zoom-out' | 'reset' }

export interface WorldSceneProps {
  model?: VipsWorldSceneModel
  environmentControls?: WorldEnvironmentControls
  onHotspotNavigate?: (href: string, hotspot: WorldHotspot) => void
  onVoicePromptSelect?: () => void
  onWorldInteraction?: (event: WorldSceneInteractionEvent) => void
  reduceMotion?: boolean
}

export function WorldScene({
  model,
  environmentControls,
  onHotspotNavigate,
  onVoicePromptSelect,
  onWorldInteraction,
  reduceMotion,
}: WorldSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<ReturnType<typeof createWorldScene> | null>(null)
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState<{
    hotspot: WorldHotspot
    pointer: WorldHotspotPointer
  } | null>(null)
  const [narrationHotspot, setNarrationHotspot] = useState<WorldHotspot | null>(null)
  const sceneModel = useMemo(() => model ?? buildVipsWorldSceneModel(), [model])
  const callbacksRef = useRef({
    onHotspotNavigate,
    onVoicePromptSelect,
    onWorldInteraction,
  })

  useEffect(() => {
    callbacksRef.current = {
      onHotspotNavigate,
      onVoicePromptSelect,
      onWorldInteraction,
    }
  }, [onHotspotNavigate, onVoicePromptSelect, onWorldInteraction])

  const handleHotspotHover = useCallback(
    (hotspot: WorldHotspot | null, pointer?: WorldHotspotPointer) => {
      setHovered(hotspot && pointer ? { hotspot, pointer } : null)
      callbacksRef.current.onWorldInteraction?.({ type: 'hotspot-hover', hotspot })
    },
    [],
  )

  const handleHotspotSelect = useCallback((hotspot: WorldHotspot) => {
    setHovered(null)
    setNarrationHotspot(hotspot)
    callbacksRef.current.onWorldInteraction?.({ type: 'hotspot-select', hotspot })
    callbacksRef.current.onWorldInteraction?.({ type: 'narration-open', hotspot })
  }, [])

  const closeNarration = useCallback(() => {
    const hotspot = narrationHotspot
    setNarrationHotspot(null)
    handleRef.current?.restoreCamera()
    callbacksRef.current.onWorldInteraction?.({ type: 'narration-close', hotspot })
  }, [narrationHotspot])

  const confirmNarration = useCallback(() => {
    const hotspot = narrationHotspot
    if (!hotspot) return
    setNarrationHotspot(null)
    handleRef.current?.restoreCamera()
    callbacksRef.current.onWorldInteraction?.({ type: 'narration-confirm', hotspot })

    const handoff = () => {
      if (hotspot.action === 'voice') {
        callbacksRef.current.onVoicePromptSelect?.()
        return
      }
      if (hotspot.href) {
        if (callbacksRef.current.onHotspotNavigate) {
          callbacksRef.current.onHotspotNavigate(hotspot.href, hotspot)
        } else window.location.href = hotspot.href
      }
    }
    window.setTimeout(handoff, 220)
  }, [narrationHotspot])

  useEffect(() => {
    if (!narrationHotspot) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeNarration()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeNarration, narrationHotspot])

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
      handleRef.current = handle
      return () => {
        handleRef.current = null
        handle.dispose()
      }
    } catch {
      setFailed(true)
    }
  }, [sceneModel, reduceMotion, handleHotspotHover, handleHotspotSelect])

  useEffect(() => {
    if (environmentControls) handleRef.current?.updateEnvironmentControls(environmentControls)
  }, [environmentControls])

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
      {!failed ? (
        <WorldCameraControls sceneHandleRef={handleRef} onWorldInteraction={onWorldInteraction} />
      ) : null}
      {narrationHotspot ? (
        <WorldNarrationOverlay
          hotspot={narrationHotspot}
          onClose={closeNarration}
          onConfirm={confirmNarration}
        />
      ) : null}
      {failed ? <WorldSceneFallback model={sceneModel} /> : null}
    </div>
  )
}

function WorldCameraControls({
  sceneHandleRef,
  onWorldInteraction,
}: {
  sceneHandleRef: MutableRefObject<ReturnType<typeof createWorldScene> | null>
  onWorldInteraction?: (event: WorldSceneInteractionEvent) => void
}) {
  const buttons = [
    {
      label: 'Zoom in',
      icon: Plus,
      onClick: () => {
        sceneHandleRef.current?.zoomBy(0.85)
        onWorldInteraction?.({ type: 'camera-control', action: 'zoom-in' })
      },
    },
    {
      label: 'Zoom out',
      icon: Minus,
      onClick: () => {
        sceneHandleRef.current?.zoomBy(1 / 0.85)
        onWorldInteraction?.({ type: 'camera-control', action: 'zoom-out' })
      },
    },
    {
      label: 'Reset view',
      icon: RotateCcw,
      onClick: () => {
        sceneHandleRef.current?.resetCamera()
        onWorldInteraction?.({ type: 'camera-control', action: 'reset' })
      },
    },
  ] as const

  return (
    <div
      className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col gap-1.5"
      data-testid="world-camera-controls"
    >
      {buttons.map((button) => {
        const Icon = button.icon
        return (
          <button
            key={button.label}
            type="button"
            aria-label={button.label}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10',
              'bg-[#fffdf6]/90 text-[#2b2620] shadow-[0_4px_12px_rgba(0,0,0,0.08)] backdrop-blur-md',
              'transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] active:translate-y-0 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
            )}
            onClick={button.onClick}
          >
            <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        )
      })}
    </div>
  )
}

function WorldNarrationOverlay({
  hotspot,
  onClose,
  onConfirm,
}: {
  hotspot: WorldHotspot
  onClose: () => void
  onConfirm: () => void
}) {
  const narration = useMemo(() => worldNarrationForHotspot(hotspot), [hotspot])
  const [visibleText, setVisibleText] = useState(narration.text)

  useEffect(() => {
    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (prefersReducedMotion) {
      setVisibleText(narration.text)
      return
    }

    let cancelled = false
    let index = 0
    setVisibleText('')
    const step = () => {
      if (cancelled) return
      index += 1
      setVisibleText(narration.text.slice(0, index))
      if (index < narration.text.length) {
        const previous = narration.text[index - 1]
        const delay = previous === '.' || previous === '?' || previous === '!' ? 140 : 22
        window.setTimeout(step, delay)
      }
    }
    const start = window.setTimeout(step, 180)
    return () => {
      cancelled = true
      window.clearTimeout(start)
    }
  }, [narration.text])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kira"
      className="pointer-events-auto absolute inset-x-4 bottom-5 z-30 mx-auto max-w-2xl rounded-[22px] border border-white/70 bg-[#fffdf6]/95 px-5 pb-4 pt-5 text-[#2b2620] shadow-[0_18px_48px_rgba(28,47,56,0.18)] backdrop-blur-xl sm:bottom-6 sm:px-6 sm:pb-5"
      data-testid="world-narration"
      data-hotspot-kind={hotspot.kind}
    >
      <div className="absolute -top-4 left-5 rounded-full bg-[#ffd45a] px-3 py-1 text-sm font-semibold text-[#3c2f16] shadow-[0_4px_12px_rgba(77,58,22,0.16)]">
        Kira
      </div>
      <button
        type="button"
        aria-label="Close"
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#5d5147] transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b2620]/30"
        onClick={onClose}
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
      <p className="min-h-[3.75rem] pr-8 text-base font-medium leading-relaxed" aria-live="polite">
        {visibleText}
      </p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold',
            'bg-[#2b2620] text-[#fffdf6] shadow-[0_8px_18px_rgba(43,38,32,0.18)]',
            'transition hover:-translate-y-0.5 hover:bg-[#40372f] active:translate-y-0 active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b2620]/30',
          )}
          onClick={onConfirm}
        >
          {narration.cta}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
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
      <p className="mt-2 text-[11px] font-semibold text-foreground/75">
        {hotspot.action === 'voice' ? 'Talk to me' : hotspot.href ? 'Open' : 'Look closer'}
      </p>
    </div>
  )
}

function worldNarrationForHotspot(hotspot: WorldHotspot): { text: string; cta: string } {
  if (hotspot.kind === 'prompt') {
    return {
      text: "It's me. If something is taking up space in your head, I can hold the first thread with you.",
      cta: 'Talk to me',
    }
  }
  if (hotspot.kind === 'mailbox') {
    if (!hotspot.href) {
      return {
        text: 'The mailbox is quiet for now. Counsellor briefs will land here when there is something to read.',
        cta: 'Okay',
      }
    }
    return {
      text: hotspot.title.toLowerCase().includes('unread')
        ? "There's something waiting in the mailbox. Want to open it?"
        : 'The mailbox is quiet, but the latest brief is still here when you want it.',
      cta: 'Open mail',
    }
  }
  if (hotspot.kind === 'value') {
    return {
      text: `${hotspot.title} is rooted here as a value you keep returning to. Want to see what it is anchored in?`,
      cta: 'Show me',
    }
  }
  if (hotspot.kind === 'interest') {
    return {
      text: `${hotspot.title} is blooming as an interest. It is small, but it has enough attention to show up on the island.`,
      cta: 'Open',
    }
  }
  if (hotspot.kind === 'skill') {
    return {
      text: `${hotspot.title} is ripening as a skill. The fruit shows where practice is starting to become usable.`,
      cta: 'Open',
    }
  }
  if (hotspot.kind === 'reflection') {
    return {
      text: `${hotspot.title} is a thought passing through the island. Want to review where it came from?`,
      cta: 'Review',
    }
  }
  if (hotspot.kind === 'mood') {
    return {
      text: `${hotspot.title} was pinned as a recent feeling. The island keeps it close so the pattern can become visible.`,
      cta: 'Open',
    }
  }
  return {
    text: hotspot.description,
    cta: hotspot.href ? 'Open' : 'Close',
  }
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
