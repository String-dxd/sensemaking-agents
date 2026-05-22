import { useEffect, useMemo, useRef } from 'react'
import type { Game } from '~/engine/student-space/Game'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { EngineStageMount } from './EngineStageMount'
import { Greeting } from './Greeting'
import { SkipButton } from './SkipButton'

/**
 * First-run ceremony orchestrator — React state machine (U16 React rewrite
 * of `src/engine/student-space/Game/View/Onboarding/OnboardingFlow.js`).
 *
 * Subscribes to the `state.onboarding` slice; renders the migrated React
 * surface for each stage (currently just `greeting`) and delegates every
 * other not-yet-`done` stage to `<EngineStageMount>` which still
 * instantiates the engine `.js` surface inside the same `.onboarding-root`
 * container.
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

const MIGRATED_STAGES: ReadonlySet<string> = new Set(['greeting'])

type OnboardingSlice = {
  stage: string
  isDone: boolean
  completedAt: string | number | null
  firstMoodPinId?: string | null
  setStage: (next: string) => string
  subscribe: (cb: (event: { kind: string }) => void) => () => void
}

type EngineRich = Game & {
  state?: {
    onboarding?: OnboardingSlice
    auth?: { isSignedIn?: boolean }
    profile?: { identity?: { name?: string | null } | null }
    day?: { setManualHour?: (hour: number) => void; clearManualHour?: () => void }
    weather?: { setAmbient?: (active: boolean) => void; setIntensity?: (n: number) => void }
  }
  view?: {
    kira?: { setOnboardingMode?: (on: boolean) => void }
    kiraDialogue?: { setOnboardingMode?: (on: boolean) => void }
  }
}

export function OnboardingFlow() {
  const engine = useEngine() as EngineRich | null
  const onboarding = engine?.state?.onboarding ?? null

  // Re-render on every persisted-stage tick. The slice publishes a 'stage'
  // event from setStage(); the version-bump pattern avoids the cached-
  // snapshot warning useSyncExternalStore triggers against the slice.
  useEngineSliceVersion(onboarding as Parameters<typeof useEngineSliceVersion>[0])

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // Wake-up rules. Run once per engine, on first render where stage is not
  // already 'done'. Mirrors the engine `start()`'s pre-loop normalisation.
  const wokeRef = useRef(false)
  useEffect(() => {
    if (!engine || !onboarding) return
    if (wokeRef.current) return
    if (onboarding.isDone) return
    wokeRef.current = true

    let stage = onboarding.stage
    if (stage === 'pending') stage = onboarding.setStage('login')
    if (stage === 'login' && engine.state?.auth?.isSignedIn) {
      stage = onboarding.setStage(onboarding.completedAt ? 'done' : 'greeting')
    }
    if (stage === 'first-mood' && onboarding.firstMoodPinId) {
      stage = onboarding.setStage('first-grow')
    }
  }, [engine, onboarding])

  // Park the world in clear midday + flip Kira into onboarding mode for the
  // duration of the ceremony. The cleanup releases all of these so a re-
  // entrant remount can replay the entry safely.
  useEffect(() => {
    if (!engine || !onboarding || onboarding.isDone) return

    document.body.classList.add('is-onboarding')
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
      document.body.classList.remove('is-onboarding')
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

  return (
    <>
      <div
        ref={rootRef}
        className="fixed inset-0 z-50 block overflow-hidden onboarding-root"
        role="dialog"
        aria-modal="true"
        aria-label="Student Space onboarding"
      >
        {MIGRATED_STAGES.has(stage) && stage === 'greeting' ? (
          <Greeting
            studentName={studentName}
            reducedMotion={reducedMotion}
            onAdvance={() => advance('egg-color')}
          />
        ) : null}
      </div>
      {!MIGRATED_STAGES.has(stage) ? (
        <EngineStageMount
          game={engine}
          stage={stage}
          rootRef={rootRef}
          reducedMotion={reducedMotion}
        />
      ) : null}
      <SkipButton game={engine} stage={stage} />
    </>
  )
}
