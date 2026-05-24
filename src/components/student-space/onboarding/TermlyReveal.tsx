import { useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { getPreset } from '~/lib/student-space/camera-tuner'
import { cn } from '~/lib/utils'
import type { IslandRevealView } from './IslandReveal'

/**
 * `termly-reveal` stage surface.
 *
 * Pulls the camera back to the tree-wide preset, grows in tree slot 0
 * (sparse-by-default Tree view had it hidden), then fades in 3 of the
 * static butterflies. Kira speaks the Termly Check-in line; the user
 * advances to `closing`.
 *
 * `closing` itself folds into this component's final beat — it shows
 * one last narrator line + a "Begin" CTA that completes onboarding and
 * restores the wall-clock day cycle. Splitting it into a separate
 * surface added a remount churn that flashed the canvas, so the final
 * beat now lives here behind a small stage check.
 */
const SEEDED_HOLD_MS = 900
const GROW_MS = 1400
const POST_GROW_MS = 900
const FINAL_HOLD_MS = 600
const SKY_LEAD_MS = 800
const TWILIGHT_HOUR = 18.5

type TermlyRevealView = IslandRevealView & {
  tree?:
    | (IslandRevealView['tree'] & {
        showIndex?: (index: number) => void
      })
    | null
  butterflies?: {
    showCount?: (n: number) => void
  } | null
  kiraNarrator?: {
    speak?: (opts: { text: string; cta?: string; onConfirm?: () => void }) => void
    close?: () => void
  } | null
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function TermlyReveal({
  stage,
  reducedMotion,
  onboarding,
  day,
  view,
}: {
  stage: 'termly-reveal' | 'closing'
  reducedMotion: boolean
  onboarding:
    | {
        setStage?: (next: string) => unknown
        complete?: () => unknown
      }
    | null
    | undefined
  day: { setManualHour?: (hour: number) => void; clearManualHour?: () => void } | null | undefined
  view: TermlyRevealView | null | undefined
}) {
  const [beginVisible, setBeginVisible] = useState(false)
  const termlyStartedRef = useRef(false)
  const closingStartedRef = useRef(false)
  const skyTimerRef = useRef<number | null>(null)
  // Prop refs so the run-once effects can read the LATEST values without
  // listing them as deps. Listing the prop refs as deps would re-fire the
  // effect on every parent render; its cleanup `abort.abort()` then kills
  // the in-flight tree grow + butterfly reveal, leaving the user on an
  // empty stage. The refs feed the latest values into the same closure.
  const viewRef = useRef(view)
  viewRef.current = view
  const dayRef = useRef(day)
  dayRef.current = day
  const onboardingRef = useRef(onboarding)
  onboardingRef.current = onboarding
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion

  useEffect(() => {
    if (stage !== 'termly-reveal') return
    if (termlyStartedRef.current) return
    termlyStartedRef.current = true

    const cameraMs = (full: number) => (reducedMotionRef.current ? 200 : full)
    const ms = (full: number) => (reducedMotionRef.current ? Math.min(full, 80) : full)

    dayRef.current?.setManualHour?.(TWILIGHT_HOUR)

    async function run() {
      const view = viewRef.current
      const treeEntry = view?.tree?.entries?.[0]
      const treePreset = getPreset('tree-wide')

      view?.camera?.zoomTo?.(
        new Vector3(treePreset.camX, treePreset.camY, treePreset.camZ),
        new Vector3(0, treePreset.lookAtY, 0),
        cameraMs(treePreset.durationMs),
      )

      await wait(ms(SEEDED_HOLD_MS))

      // Reveal the tree group at authored scale BEFORE growIn so the
      // sparse-by-default hideAll can't keep it invisible. growIn then
      // resets scale to 0 and tweens up; the canopy InstancedMesh is
      // re-projected per frame from the trunk's world transform.
      view?.tree?.showIndex?.(0)
      view?.sound?.playOneShot?.('grow')
      // Fire-and-forget so a stalled engine update loop can't strand
      // the ceremony. The wait below is the user-visible budget.
      if (treeEntry) view?.tree?.growIn?.(0, { duration: GROW_MS })
      await wait(ms(GROW_MS + POST_GROW_MS))

      // Butterflies fade in alongside the new tree as the "more was
      // already here" gift lands.
      view?.butterflies?.showCount?.(3)

      view?.kiraNarrator?.speak?.({
        text: ONBOARDING_COPY.kira.termlyReveal,
        cta: ONBOARDING_COPY.termlyReveal.cta,
        onConfirm: () => onboardingRef.current?.setStage?.('closing'),
      })
    }

    // Run-once across React StrictMode double-mount, HMR, parent
    // re-renders. termlyStartedRef gates the second pass.
    void run()
  }, [stage])

  // Closing beat — second narrator line + Begin CTA.
  useEffect(() => {
    if (stage !== 'closing') return
    if (closingStartedRef.current) return
    closingStartedRef.current = true
    const view = viewRef.current
    view?.kiraNarrator?.speak?.({
      text: ONBOARDING_COPY.kira.closing,
      cta: ONBOARDING_COPY.closing.cta,
      onConfirm: () => {
        if (skyTimerRef.current != null) {
          window.clearTimeout(skyTimerRef.current)
          skyTimerRef.current = null
        }
        skyTimerRef.current = window.setTimeout(
          () => {
            skyTimerRef.current = null
            dayRef.current?.clearManualHour?.()
          },
          reducedMotionRef.current ? 40 : SKY_LEAD_MS,
        )
        viewRef.current?.camera?.resetToDefault?.(reducedMotionRef.current ? 200 : 1800)
        viewRef.current?.kiraNarrator?.close?.()
        const onboarding = onboardingRef.current
        if (onboarding?.complete) onboarding.complete()
        else onboarding?.setStage?.('done')
      },
    })

    const fadeId = window.setTimeout(() => setBeginVisible(true), FINAL_HOLD_MS)
    return () => {
      window.clearTimeout(fadeId)
      if (skyTimerRef.current != null) {
        window.clearTimeout(skyTimerRef.current)
        skyTimerRef.current = null
      }
    }
  }, [stage])

  return (
    <div
      data-testid="onboarding-termly-reveal"
      className={cn(
        'absolute inset-0 pointer-events-none bg-transparent',
        'transition-opacity duration-[200ms] ease-out',
        beginVisible ? 'opacity-100' : 'opacity-0',
      )}
    />
  )
}
