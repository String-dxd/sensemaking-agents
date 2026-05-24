import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { getPreset } from '~/lib/student-space/camera-tuner'
import type { IslandRevealView } from './IslandReveal'

/**
 * `bloom-celebrate` stage surface.
 *
 * Camera dollies to the bloom preset on the ceremony flower slot (the
 * sparse-by-default Flowers view kept it hidden until now). If the just-
 * committed capture carried an emotion via the user's most recent mood
 * pin, the flower's species and tint are mapped from the emotion before
 * the bloom tween runs. Kira then speaks the celebration line; the user
 * advances to `termly-reveal` via the narrator CTA.
 */
const SETUP_HOLD_MS = 1100
const BLOOM_MS = 520
const POST_BLOOM_MS = 700

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

type BloomCelebrateView = IslandRevealView & {
  flowers?:
    | (IslandRevealView['flowers'] & {
        showIndex?: (index: number) => void
      })
    | null
  kiraNarrator?: {
    speak?: (opts: { text: string; cta?: string; onConfirm?: () => void }) => void
    close?: () => void
  } | null
}

export function BloomCelebrate({
  reducedMotion,
  view,
  onAdvance,
}: {
  reducedMotion: boolean
  view: BloomCelebrateView | null | undefined
  onAdvance: () => void
}) {
  // Prop refs so the run-once effect can read the LATEST props without
  // listing them as deps — the cleanup of a re-fired effect would abort
  // the in-flight bloom and reduce the ceremony to a blink.
  const viewRef = useRef(view)
  viewRef.current = view
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  const onAdvanceRef = useRef(onAdvance)
  onAdvanceRef.current = onAdvance
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const cameraMs = (full: number) => (reducedMotionRef.current ? 200 : full)
    const ms = (full: number) => (reducedMotionRef.current ? Math.min(full, 80) : full)

    async function run() {
      const view = viewRef.current
      const onAdvance = () => onAdvanceRef.current()
      const flower = view?.flowers?.flowers?.[0]
      if (!flower) {
        // Asset boot stalled — best-effort fallback: still let the user
        // continue rather than stranding them on an empty stage.
        view?.kiraNarrator?.speak?.({
          text: ONBOARDING_COPY.kira.bloomCelebrate,
          cta: ONBOARDING_COPY.bloomCelebrate.cta,
          onConfirm: onAdvance,
        })
        return
      }

      const bloomPreset = getPreset('bloom')
      const lookAt = new Vector3(flower.x, bloomPreset.lookAtY, flower.z)
      const camPos = new Vector3(
        flower.x,
        lookAt.y + bloomPreset.camYAboveLookAt,
        flower.z + bloomPreset.camZBack,
      )
      view?.camera?.zoomTo?.(camPos, lookAt, cameraMs(bloomPreset.durationMs))

      await wait(ms(SETUP_HOLD_MS))

      // Belt-and-braces — bloomInstance flips the group visible itself,
      // but if a sparse-by-default hideAll fired AFTER bloomInstance
      // started (e.g., engine boot finishing late), the bloom would tween
      // an invisible group. showIndex guarantees the group is visible at
      // full scale before the animation starts; bloomInstance then resets
      // scale to 0 and tweens up.
      view?.flowers?.showIndex?.(0)
      view?.sound?.playOneShot?.('bloom')
      // Fire bloom without awaiting — if the engine's update loop is
      // paused for any reason the Promise hangs forever. The capped wait
      // below is the user-visible budget for the petals to scale in.
      view?.flowers?.bloomInstance?.(0, { duration: BLOOM_MS })
      await wait(ms(BLOOM_MS + POST_BLOOM_MS))

      view?.kiraNarrator?.speak?.({
        text: ONBOARDING_COPY.kira.bloomCelebrate,
        cta: ONBOARDING_COPY.bloomCelebrate.cta,
        onConfirm: onAdvance,
      })
    }

    // Run-once across React StrictMode double-mount, HMR, and parent
    // re-renders. startedRef gates the second pass; the in-flight Promise
    // is left to settle on its own — engine writes are idempotent and
    // the kiraNarrator panel is owned by the engine so it survives a
    // React remount cleanly.
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
