import { useLocation, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { Game } from '~/engine/student-space/Game'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { cn } from '~/lib/utils'
import { CameraTuneHud } from './CameraTuneHud'
import { EdupassLogin } from './EdupassLogin'
import { EggHatcher } from './EggHatcher'
import { FirstChat } from './FirstChat'
import { FirstMood } from './FirstMood'
import { Greeting } from './Greeting'
import { IslandReveal, type IslandRevealView } from './IslandReveal'
import { SkipButton } from './SkipButton'

/**
 * First-run ceremony orchestrator — React state machine.
 *
 * Subscribes to the `state.onboarding` slice; renders the migrated React
 * surface for every ceremony stage inside the React-owned onboarding root.
 *
 * Owns the cross-cutting ceremony chrome:
 *   - `body.is-onboarding` while not `done`
 *   - park the world in clear midday (day.setManualHour, weather.setAmbient)
 *   - put Kira + dialogue into onboarding mode for the duration
 *   - drop the legacy ColdStart flag on completion
 *
 * Replaces the engine orchestrator's wake-up rules: `pending`→`login`
 * default, `login`+signed-in fast-forward, `first-mood`+committed pin
 * fast-forward.
 */
const LEGACY_COLDSTART_FLAG = 'studentSpace.firstArrivalSeen'

type OnboardingSlice = {
  stage: string
  isDone: boolean
  completedAt: string | number | null
  companionName?: string | null
  eggColorId?: string | null
  firstMoodPinId?: string | null
  setStage: (next: string) => string
  setEggColor?: (id: string) => unknown
  setCompanionName?: (name: string) => unknown
  setFirstMoodPinId?: (pinId: string) => string | null | undefined
  complete?: () => unknown
  subscribe: (cb: (event: { kind: string }) => void) => () => void
}

type EngineRich = Game & {
  state?: {
    onboarding?: OnboardingSlice
    auth?: { isSignedIn?: boolean }
    profile?: {
      identity?: { name?: string | null } | null
      setIdentity?: (identity: {
        name?: string
        className?: string
        companionSpecies?: string
        companionName?: string
      }) => unknown
    }
    backend?: unknown
    persistence?: { flush?: () => unknown }
    moodPins?: {
      pins?: Array<{ id?: string | null; emotion?: string | null }>
      add: (input: { emotion: string; intensity: number }) => { id?: string } | null
    }
    day?: {
      setManualHour?: (hour: number) => void
      clearManualHour?: () => void
      setMood?: (emotion: string) => void
    }
    weather?: { setAmbient?: (active: boolean) => void; setIntensity?: (n: number) => void }
  }
  view?: {
    camera?: {
      instance?: { position?: { clone?: () => { x: number; y: number; z: number } } }
      zoomTo?: (position: unknown, lookAt: unknown, duration: number) => void
      restoreZoom?: (duration: number) => void
      startLandingOrbit?: (opts: {
        azimuthDegPerSec: number
        distance: number
        pitchDeg: number
      }) => void
      stopLandingOrbit?: () => void
    }
    kira?: {
      setOnboardingMode?: (on: boolean) => void
      setSpecies?: (id: string) => unknown
      perchX?: number
      perchY?: number
      perchZ?: number
      perchYaw?: number
      flyTo?: (opts: {
        startPos: { x: number; y: number; z: number }
        endPos: { x: number; y: number; z: number }
        midOffset: { x: number; y: number; z: number }
        duration: number
        endYaw?: number
        reducedMotion: boolean
      }) => Promise<void> | void
    }
    kiraDialogue?: {
      setOnboardingMode?: (on: boolean) => void
      sayOnboarding?: (line: string) => void
      clearOnboardingBubble?: () => void
    }
    flowers?: IslandRevealView['flowers']
    tree?: IslandRevealView['tree']
    sound?: IslandRevealView['sound']
  }
}

export function OnboardingFlow() {
  const engine = useEngine() as EngineRich | null
  const onboarding = engine?.state?.onboarding ?? null
  const { setIsOnboarding } = useEngineOverlay()
  const navigate = useNavigate()
  const location = useLocation()

  // Re-render on every persisted-stage tick. The slice publishes a 'stage'
  // event from setStage(); the version-bump pattern avoids the cached-
  // snapshot warning useSyncExternalStore triggers against the slice.
  const onboardingVersion = useEngineSliceVersion(
    onboarding as Parameters<typeof useEngineSliceVersion>[0],
  )

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // Wake-up rules. Run once per engine, on first render where stage is not
  // already 'done'. Mirrors the engine `start()`'s pre-loop normalisation.
  const wokeRef = useRef(false)
  useEffect(() => {
    void onboardingVersion
    if (!engine || !onboarding) return
    if (onboarding.isDone) {
      wokeRef.current = false
      return
    }
    if (onboarding.stage === 'first-mood' && onboarding.firstMoodPinId) {
      onboarding.setStage('first-grow')
      return
    }
    if (onboarding.stage === 'pending') wokeRef.current = false
    if (wokeRef.current) return
    wokeRef.current = true

    let stage = onboarding.stage
    if (stage === 'pending') stage = onboarding.setStage('login')
    if (stage === 'login' && engine.state?.auth?.isSignedIn) {
      stage = onboarding.setStage(onboarding.completedAt ? 'done' : 'greeting')
    }
    if (stage === 'first-mood' && onboarding.firstMoodPinId) {
      stage = onboarding.setStage('first-grow')
    }
  }, [engine, onboarding, onboardingVersion])

  const active = Boolean(
    engine && onboarding && !onboarding.isDone && onboarding.stage !== 'pending',
  )

  useEffect(() => {
    setIsOnboarding(active)
    return () => setIsOnboarding(false)
  }, [active, setIsOnboarding])

  useEffect(() => {
    if (active && location.pathname !== '/onboarding') {
      void navigate({ to: '/onboarding' })
    }
    if (!active && onboarding?.stage !== 'pending' && location.pathname === '/onboarding') {
      void navigate({ to: '/' })
    }
  }, [active, location.pathname, navigate, onboarding?.stage])

  // Park the world in clear midday + flip Kira into onboarding mode for the
  // duration of the ceremony. The cleanup releases all of these so a re-
  // entrant remount can replay the entry safely.
  useEffect(() => {
    if (!engine || !onboarding || onboarding.isDone) return

    try {
      engine.state?.weather?.setAmbient?.(false)
      engine.state?.weather?.setIntensity?.(0)
      engine.state?.day?.setManualHour?.(11.5)
    } catch {
      // Defensive — these slices are stable but tolerate missing methods.
    }
    engine.view?.kira?.setOnboardingMode?.(true)
    engine.view?.kiraDialogue?.setOnboardingMode?.(true)

    return () => {
      try {
        engine.state?.day?.clearManualHour?.()
        engine.state?.weather?.setAmbient?.(true)
      } catch {
        // same
      }
      engine.view?.kira?.setOnboardingMode?.(false)
      engine.view?.kiraDialogue?.setOnboardingMode?.(false)
    }
  }, [engine, onboarding, onboarding?.isDone])

  // Drop the legacy ColdStart "seen" flag once the ceremony hits 'done' so
  // subsequent boots land at wall-clock instead of replaying the twilight
  // pin. Mirrors engine `_finish()` line.
  useEffect(() => {
    if (!onboarding?.isDone) return
    try {
      localStorage.setItem(LEGACY_COLDSTART_FLAG, '1')
    } catch {
      // safari private mode + similar — non-fatal
    }
  }, [onboarding?.isDone])

  const rootRef = useRef<HTMLDivElement | null>(null)

  if (!engine || !onboarding || onboarding.isDone || onboarding.stage === 'pending') {
    return null
  }

  const stage = onboarding.stage
  const studentName = engine.state?.profile?.identity?.name ?? ''
  const advance = (next: string) => {
    onboarding.setStage(next)
  }
  const surface =
    stage === 'login' ? (
      <EdupassLogin reducedMotion={reducedMotion} camera={engine.view?.camera} />
    ) : stage === 'greeting' ? (
      <Greeting
        studentName={studentName}
        reducedMotion={reducedMotion}
        onAdvance={() => advance('egg-color')}
      />
    ) : stage === 'egg-color' || stage === 'egg-name' || stage === 'egg-hatch' ? (
      <EggHatcher
        stage={stage}
        reducedMotion={reducedMotion}
        onboarding={onboarding}
        profile={engine.state?.profile as Parameters<typeof EggHatcher>[0]['profile']}
        kira={engine.view?.kira}
        onAdvance={advance}
      />
    ) : stage === 'first-chat' ? (
      <FirstChat
        reducedMotion={reducedMotion}
        profile={engine.state?.profile}
        onboarding={onboarding}
        kira={engine.view?.kira}
        camera={engine.view?.camera}
        kiraDialogue={engine.view?.kiraDialogue}
        sound={engine.view?.sound}
        onAdvance={() => advance('first-mood')}
      />
    ) : stage === 'first-mood' ? (
      <FirstMood
        reducedMotion={reducedMotion}
        moodPins={engine.state?.moodPins}
        onboarding={onboarding}
        day={engine.state?.day}
        kiraDialogue={engine.view?.kiraDialogue}
        camera={engine.view?.camera}
        onAdvance={() => advance('first-grow')}
      />
    ) : stage === 'first-grow' || stage === 'tree-narration' || stage === 'closing' ? (
      <IslandReveal
        stage={stage}
        reducedMotion={reducedMotion}
        onboarding={onboarding}
        moodPins={engine.state?.moodPins}
        day={engine.state?.day}
        view={engine.view}
      />
    ) : null

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 block overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Student Space onboarding"
    >
      <StageSlot stage={stage}>{surface}</StageSlot>
      <SkipButton game={engine} stage={stage} />
      {import.meta.env.DEV ? (
        <CameraTuneHud
          targets={{
            camera: engine.view?.camera,
            kira: engine.view?.kira,
            flowers: engine.view?.flowers as { flowers?: Array<{ x: number; z: number }> } | null,
          }}
        />
      ) : null}
    </div>
  )
}

type StageLayer = {
  stage: string
  children: ReactNode
  layerKey: number
  outgoing: boolean
}

function StageSlot({ stage, children }: { stage: string; children: ReactNode }) {
  // Layered crossfade between onboarding stages. When `stage` changes, we
  // keep the previous stage mounted for ~200ms while it fades out, then
  // drop it. The new stage fades in over 320ms with an 80ms delay
  // (creates the overlap). Important: this only animates *between*
  // stages — per-stage `visible` ramps (EdupassLogin, Greeting, etc.)
  // and the Kira pre-land contract are owned by the stage components,
  // not this slot.
  const layerKeyRef = useRef(0)
  const [layers, setLayers] = useState<StageLayer[]>(() => [
    { stage, children, layerKey: layerKeyRef.current, outgoing: false },
  ])

  useEffect(() => {
    setLayers((current) => {
      const top = current[current.length - 1]
      if (top && top.stage === stage) {
        // Same stage, fresh children reference — just update the top layer.
        return current.map((layer, index) =>
          index === current.length - 1 ? { ...layer, children } : layer,
        )
      }
      // New stage: mark all existing layers outgoing, append the new one.
      layerKeyRef.current += 1
      return [
        ...current.map((layer) => ({ ...layer, outgoing: true })),
        { stage, children, layerKey: layerKeyRef.current, outgoing: false },
      ]
    })

    const id = window.setTimeout(() => {
      setLayers((current) => current.filter((layer) => !layer.outgoing))
    }, 240)
    return () => window.clearTimeout(id)
  }, [stage, children])

  return (
    <>
      {layers.map((layer) => (
        <div
          key={layer.layerKey}
          className={cn(
            'absolute inset-0',
            layer.outgoing
              ? 'pointer-events-none animate-[onboardingStageOut_200ms_var(--onb-ease)_both]'
              : 'animate-[onboardingStageIn_320ms_var(--onb-ease)_80ms_both]',
          )}
          data-stage={layer.stage}
          data-testid={layer.outgoing ? 'onboarding-stage-slot-outgoing' : 'onboarding-stage-slot'}
        >
          {layer.children}
        </div>
      ))}
    </>
  )
}
