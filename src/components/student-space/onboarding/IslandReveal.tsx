import { useCallback, useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { EMOTIONS } from '~/lib/student-space/mood-shapes'
import { cn } from '~/lib/utils'

/**
 * Closing island reveal sequence (U18 React rewrite of
 * React island reveal surface for the onboarding ceremony.
 *
 * React owns the chip layer and timing. The engine still owns the camera,
 * flowers, tree, sound, and Kira bubble; this component calls those same
 * engine hooks at the same persisted stages:
 *   first-grow -> tree-narration -> closing -> done.
 */
const ENTER_MS = 200
const TWILIGHT_HOUR = 18.5
const SETUP_HOLD_MS = 1600
const BLOOM_MS = 520
const POST_BLOOM_MS = 1200
const SEEDED_HOLD_MS = 1600
const GROW_MS = 1400
const POST_GROW_MS = 1400
const FINAL_HOLD_MS = 1200
const SKY_LEAD_MS = 800

type RevealStage = 'first-grow' | 'tree-narration' | 'closing'

type MoodPin = { id?: string | null; emotion?: string | null }

export type IslandRevealView = {
  camera?: {
    zoomTo?: (position: Vector3, lookAt: Vector3, duration: number) => void
    resetToDefault?: (duration: number) => void
  } | null
  flowers?: {
    flowers?: Array<{ x: number; z: number }>
    setFirstSpeciesForEmotion?: (emotion: string, color: string) => unknown
    bloomInstance?: (index: number, opts: { duration: number }) => Promise<void> | void
  } | null
  tree?: {
    entries?: Array<unknown>
    growIn?: (index: number, opts: { duration: number }) => Promise<void> | void
  } | null
  sound?: { playOneShot?: (name: 'bloom' | 'grow') => void } | null
  kiraDialogue?: {
    sayOnboarding?: (line: string) => void
    clearOnboardingBubble?: () => void
  } | null
}

type ChipState = {
  label: string
  onClick: () => void
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const id = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(id)
        resolve()
      },
      { once: true },
    )
  })
}

export function IslandReveal({
  stage,
  reducedMotion,
  onboarding,
  moodPins,
  day,
  view,
}: {
  stage: RevealStage
  reducedMotion: boolean
  onboarding:
    | {
        firstMoodPinId?: string | null
        setStage?: (next: string) => unknown
        complete?: () => unknown
      }
    | null
    | undefined
  moodPins: { pins?: MoodPin[] } | null | undefined
  day: { setManualHour?: (hour: number) => void; clearManualHour?: () => void } | null | undefined
  view: IslandRevealView | null | undefined
}) {
  const [visible, setVisible] = useState(reducedMotion)
  const [chip, setChip] = useState<ChipState | null>(null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const clearManualHourTimeoutRef = useRef<number | null>(null)

  const ms = useCallback(
    (full: number) => (reducedMotion ? Math.min(full, 80) : full),
    [reducedMotion],
  )
  const cameraMs = useCallback((full: number) => (reducedMotion ? 200 : full), [reducedMotion])

  useEffect(() => {
    const abort = new AbortController()
    abortRef.current = abort
    day?.setManualHour?.(TWILIGHT_HOUR)

    const firstPin = onboarding?.firstMoodPinId
      ? moodPins?.pins?.find((pin) => pin.id === onboarding.firstMoodPinId)
      : null
    const emotionId = firstPin?.emotion ?? null
    const emotion = emotionId ? EMOTIONS.find((entry) => entry.id === emotionId) : null
    if (emotionId && emotion) {
      view?.flowers?.setFirstSpeciesForEmotion?.(emotionId, emotion.color)
    }

    if (reducedMotion) {
      setVisible(true)
    } else {
      const frame = requestAnimationFrame(() => setVisible(true))
      const cancelFrameId = window.setTimeout(() => cancelAnimationFrame(frame), ENTER_MS)
      abort.signal.addEventListener(
        'abort',
        () => {
          cancelAnimationFrame(frame)
          window.clearTimeout(cancelFrameId)
        },
        { once: true },
      )
    }

    return () => {
      abort.abort()
      if (clearManualHourTimeoutRef.current != null) {
        window.clearTimeout(clearManualHourTimeoutRef.current)
        clearManualHourTimeoutRef.current = null
      }
    }
  }, [day, moodPins, onboarding, reducedMotion, view])

  const runBegin = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true
    setChip(null)
    if (clearManualHourTimeoutRef.current != null)
      window.clearTimeout(clearManualHourTimeoutRef.current)
    clearManualHourTimeoutRef.current = window.setTimeout(
      () => {
        clearManualHourTimeoutRef.current = null
        day?.clearManualHour?.()
      },
      reducedMotion ? 40 : SKY_LEAD_MS,
    )
    view?.camera?.resetToDefault?.(cameraMs(1800))
    view?.kiraDialogue?.clearOnboardingBubble?.()
    if (onboarding?.complete) onboarding.complete()
    else onboarding?.setStage?.('done')
  }, [cameraMs, day, onboarding, reducedMotion, view])

  const runTree = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setChip(null)
    const signal = abortRef.current?.signal ?? new AbortController().signal
    const treeEntry = view?.tree?.entries?.[0]

    view?.camera?.zoomTo?.(new Vector3(3, 5.5, 8), new Vector3(0, 1.8, 0), cameraMs(1400))
    view?.kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.islandSeeded)

    await wait(ms(SEEDED_HOLD_MS), signal)
    if (signal.aborted) return

    view?.sound?.playOneShot?.('grow')
    if (treeEntry) await view?.tree?.growIn?.(0, { duration: GROW_MS })
    if (signal.aborted) return

    await wait(ms(POST_GROW_MS), signal)
    if (signal.aborted) return

    onboarding?.setStage?.('closing')
    view?.kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.islandFinal)
    await wait(ms(FINAL_HOLD_MS), signal)
    if (signal.aborted) return

    busyRef.current = false
    setChip({ label: ONBOARDING_COPY.islandReveal.beginCta, onClick: runBegin })
  }, [cameraMs, ms, onboarding, runBegin, view])

  const runBloom = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setChip(null)
    const signal = abortRef.current?.signal ?? new AbortController().signal
    const flower = view?.flowers?.flowers?.[0]

    view?.kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.islandPlantSetup)
    if (flower) {
      const lookAt = new Vector3(flower.x, 0.7, flower.z)
      const camPos = new Vector3(flower.x, lookAt.y + 1.1, flower.z + 1.8)
      view?.camera?.zoomTo?.(camPos, lookAt, cameraMs(1100))
    }

    await wait(ms(SETUP_HOLD_MS), signal)
    if (signal.aborted) return

    view?.sound?.playOneShot?.('bloom')
    if (flower) await view?.flowers?.bloomInstance?.(0, { duration: BLOOM_MS })
    if (signal.aborted) return

    view?.kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.islandPlantDone)
    await wait(ms(POST_BLOOM_MS), signal)
    if (signal.aborted) return

    onboarding?.setStage?.('tree-narration')
    busyRef.current = false
    setChip({ label: ONBOARDING_COPY.islandReveal.treeCta, onClick: () => void runTree() })
  }, [cameraMs, ms, onboarding, runTree, view])

  useEffect(() => {
    if (busyRef.current) return
    if (stage === 'first-grow') {
      setChip({ label: ONBOARDING_COPY.islandReveal.bloomCta, onClick: () => void runBloom() })
    } else if (stage === 'tree-narration') {
      setChip({ label: ONBOARDING_COPY.islandReveal.treeCta, onClick: () => void runTree() })
    } else {
      setChip({ label: ONBOARDING_COPY.islandReveal.beginCta, onClick: runBegin })
    }
  }, [runBegin, runBloom, runTree, stage])

  useEffect(() => {
    if (!chip) return
    const id = window.setTimeout(() => chipRef.current?.focus({ preventScroll: true }), 60)
    return () => window.clearTimeout(id)
  }, [chip])

  return (
    <div
      data-testid="onboarding-island-reveal"
      className={cn(
        'absolute inset-0 pointer-events-auto bg-[rgba(15,18,36,0.04)]',
        'transition-opacity duration-[200ms] ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <fieldset
        hidden={!chip}
        aria-label="Island reveal"
        className={cn(
          'm-0 border-0 p-0',
          'absolute left-1/2 bottom-[max(28px,env(safe-area-inset-bottom,0px))] z-[5]',
          '-translate-x-1/2 flex justify-center gap-2.5 px-4',
        )}
      >
        <legend className="sr-only">Island reveal</legend>
        {chip ? (
          <button
            ref={chipRef}
            type="button"
            onClick={chip.onClick}
            className={cn(
              'min-h-11 rounded-full border border-transparent bg-(--color-onb-accent)',
              'px-5 py-3 text-[15px] font-medium text-white shadow-[0_8px_20px_rgba(255,138,92,0.32)]',
              'transition-[transform,background,box-shadow] duration-150 ease-out',
              'hover:-translate-y-px hover:bg-(--color-onb-accent-deep)',
              'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
            )}
          >
            {chip.label}
          </button>
        ) : null}
      </fieldset>
    </div>
  )
}
