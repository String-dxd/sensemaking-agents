import { useEffect, useRef, useState } from 'react'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { getPreset } from '~/lib/student-space/camera-tuner'
import { cn } from '~/lib/utils'

/**
 * Post-hatch chat beat (U17 React rewrite of
 * React first-chat surface for the onboarding ceremony.
 *
 * The canvas still owns Kira and the camera. This component owns the DOM
 * sheen, action chips, and timing that asks Kira to fly in, speak, zoom, and
 * then hand off to the first-mood picker.
 *
 * Framing values (distance, yaw offset, vertical tilt) live in
 * `~/lib/student-space/camera-tuner` so the dev HUD (Cmd+K) can tune them
 * against the live engine and the user can copy results back into source.
 */
const ENTER_MS = 320
// Arrival beat: the character is already parked at its home perch (onboarding
// mode snaps it there); the intro reveals it in place and plays the wake
// flourish once while the camera zooms in. The long west-beach walk was cut —
// it made the ceremony drag and replayed the sleep/wake loop on re-renders.
const SETTLE_DURATION_S = 2
const SETTLE_HOLD_MS = 300

type VectorLike = {
  x: number
  y: number
  z: number
  set?: (x: number, y: number, z: number) => VectorLike
  clone?: () => VectorLike
}

type Kira = {
  perchX?: number
  perchY?: number
  perchZ?: number
  perchYaw?: number
  flyTo?: (opts: {
    endPos: { x: number; y: number; z: number }
    duration: number
    endYaw?: number
    reducedMotion: boolean
  }) => Promise<void> | void
}

type Camera = {
  instance?: { position?: { clone?: () => VectorLike } }
  zoomTo?: (position: VectorLike, lookAt: VectorLike, duration: number) => void
  restoreZoom?: (duration: number) => void
}

type KiraNarrator = {
  speak?: (opts: { text: string; cta?: string; onConfirm?: () => void }) => void
  close?: () => void
}

type SoundLike = {
  playOneShot?: (name: string) => void
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

function makeVector(camera: Camera | null | undefined, x: number, y: number, z: number) {
  const vector = camera?.instance?.position?.clone?.()
  if (!vector) return null
  if (typeof vector.set === 'function') return vector.set(x, y, z)
  vector.x = x
  vector.y = y
  vector.z = z
  return vector
}

function companionNameFrom(profile: unknown, onboarding: { companionName?: string | null }) {
  const identity = (profile as { identity?: { companionName?: string | null } } | null)?.identity
  return identity?.companionName?.trim() || onboarding.companionName?.trim() || 'your bird'
}

export function FirstChat({
  reducedMotion,
  profile,
  onboarding,
  kira,
  camera,
  kiraNarrator,
  sound,
  onAdvance,
}: {
  reducedMotion: boolean
  profile: unknown
  onboarding: { companionName?: string | null }
  kira: Kira | null | undefined
  camera: Camera | null | undefined
  kiraNarrator: KiraNarrator | null | undefined
  sound?: SoundLike | null | undefined
  onAdvance: () => void
}) {
  const [visible, setVisible] = useState(reducedMotion)
  const zoomedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // Progression now lives entirely in the bottom NarratorPanel — its single
  // CTA fires the next beat. These refs track where we are in the sequence
  // so callbacks captured by `speak()` can read the latest index.
  const beatsRef = useRef<string[]>([])
  const beatIndexRef = useRef(0)
  // Prop refs so the run-once effect reads the LATEST props without listing
  // them as deps (same pattern as BloomCelebrate/TermlyReveal). Re-firing the
  // effect on a parent render replayed the whole arrival — the bird teleported
  // off-perch and looped its sleep/wake clip on every chat beat.
  const kiraRef = useRef(kira)
  kiraRef.current = kira
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const kiraNarratorRef = useRef(kiraNarrator)
  kiraNarratorRef.current = kiraNarrator
  const soundRef = useRef(sound)
  soundRef.current = sound
  const profileRef = useRef(profile)
  profileRef.current = profile
  const onboardingRef = useRef(onboarding)
  onboardingRef.current = onboarding
  const onAdvanceRef = useRef(onAdvance)
  onAdvanceRef.current = onAdvance
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const abort = new AbortController()
    abortRef.current = abort

    async function runIntro() {
      const reducedMotion = reducedMotionRef.current
      const kira = kiraRef.current
      const camera = cameraRef.current
      if (!reducedMotion) {
        const frame = requestAnimationFrame(() => setVisible(true))
        await wait(ENTER_MS, abort.signal)
        cancelAnimationFrame(frame)
      } else {
        setVisible(true)
      }
      if (abort.signal.aborted) return

      // Reveal the bird at its home perch (onboarding mode parked it there)
      // and let the settle/wake flourish play through once. No cross-island
      // walk — the intro is a single zoom-in on the bird.
      const settlePromise =
        kira?.flyTo?.({
          endPos: {
            x: kira.perchX ?? 0,
            y: kira.perchY ?? 0,
            z: kira.perchZ ?? 0,
          },
          duration: SETTLE_DURATION_S,
          endYaw: kira.perchYaw,
          reducedMotion,
        }) ?? Promise.resolve()

      // Camera 3/4 portrait on Kira, started immediately so the dolly and
      // the wake flourish resolve together. The silhouette is built facing
      // local +X, so rotated by yaw around Y the world face direction is
      // (cos yaw, 0, -sin yaw). Yaw offset, distance, and vertical tilt
      // live in the camera-tuner preset.
      const preset = getPreset('first-chat')
      const { durationMs, yawOffsetDeg, distance, camYAboveLookAt, lookAtYAbovePerch } = preset
      if (camera && kira && !reducedMotion) {
        const lookAt = makeVector(
          camera,
          kira.perchX ?? 0,
          (kira.perchY ?? 0) + lookAtYAbovePerch,
          kira.perchZ ?? 0,
        )
        const yaw = (kira.perchYaw ?? 0) + (yawOffsetDeg * Math.PI) / 180
        const fx = Math.cos(yaw)
        const fz = -Math.sin(yaw)
        const camPos = makeVector(
          camera,
          (kira.perchX ?? 0) + fx * distance,
          (kira.perchY ?? 0) + lookAtYAbovePerch + camYAboveLookAt,
          (kira.perchZ ?? 0) + fz * distance,
        )
        if (lookAt && camPos) {
          camera.zoomTo?.(camPos, lookAt, durationMs)
          zoomedRef.current = true
        }
      }

      await settlePromise
      if (abort.signal.aborted) return

      // Small beat so the intro line lands after the flourish + dolly have
      // settled rather than mid-motion.
      if (!reducedMotion) {
        await wait(SETTLE_HOLD_MS, abort.signal)
        if (abort.signal.aborted) return
      }

      const line = ONBOARDING_COPY.kira.firstChatIntro.replace(
        '{companionName}',
        companionNameFrom(profileRef.current, onboardingRef.current),
      )
      try {
        soundRef.current?.playOneShot?.('chime')
      } catch {
        // SFX is best-effort; never break the ceremony on a missing sample.
      }
      // The explainer beats make up the sequence the user walks through
      // one CTA tap at a time. Built once on intro so showNextBeat() can
      // advance via the index ref. The final beat hands off into the
      // first-capture stage; its CTA reads "Start first capture".
      beatsRef.current = [...ONBOARDING_COPY.kira.firstChatExplainer]
      beatIndexRef.current = 0
      kiraNarratorRef.current?.speak?.({
        text: line,
        cta: 'Tell me more',
        onConfirm: showNextBeat,
      })
    }

    void runIntro()

    function showNextBeat() {
      const beats = beatsRef.current
      const i = beatIndexRef.current
      if (i >= beats.length) {
        feelNow()
        return
      }
      const isLast = i === beats.length - 1
      beatIndexRef.current = i + 1
      kiraNarratorRef.current?.speak?.({
        text: beats[i] ?? '',
        cta: isLast ? ONBOARDING_COPY.firstChatActions.feel : 'Continue',
        onConfirm: isLast ? feelNow : showNextBeat,
      })
    }

    function feelNow() {
      kiraNarratorRef.current?.close?.()
      if (zoomedRef.current) {
        cameraRef.current?.restoreZoom?.(700)
        zoomedRef.current = false
      }
      onAdvanceRef.current()
    }

    // Cleanup runs on true unmount only (empty dep array): drop the panel
    // cleanly if FirstChat unmounts mid-flow (e.g. the user navigates away)
    // and hand the camera anchor back if the dolly already started, so a
    // follow-on cinematic doesn't restore to the wrong pose.
    return () => {
      abort.abort()
      kiraNarratorRef.current?.close?.()
      if (zoomedRef.current) {
        try {
          cameraRef.current?.restoreZoom?.(0)
        } catch {
          // restoreZoom is best-effort during teardown.
        }
        zoomedRef.current = false
      }
    }
  }, [])

  return (
    <div
      data-testid="onboarding-first-chat"
      className={cn('absolute inset-0 pointer-events-auto bg-transparent', visible && 'is-visible')}
    >
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 pointer-events-none bg-[rgba(15,18,36,0)]',
          'transition-colors duration-[320ms] ease-out',
          visible && 'bg-[rgba(15,18,36,0.18)]',
        )}
      />
    </div>
  )
}
