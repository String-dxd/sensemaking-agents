import { useEffect, useRef, useState } from 'react'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { getPreset } from '~/lib/student-space/camera-tuner'
import { cn } from '~/lib/utils'

/**
 * Onboarding dialogue beat — the transcript's three screens.
 *
 * The canvas still owns Kira and the camera. This component cuts the camera
 * straight down to the bird, lets the wake flourish play, then speaks the
 * three onboarding screens one CTA tap at a time (the engine plays the talk
 * clip while the narrator panel is open). The final screen ends the ceremony.
 *
 * Framing values (distance, yaw offset, vertical tilt) live in
 * `~/lib/student-space/camera-tuner` so the dev HUD (Cmd+K) can tune them
 * against the live engine and the user can copy results back into source.
 */
// Arrival beat: the character is already parked at its home perch (onboarding
// mode snaps it there); the intro reveals it in place and plays the wake
// flourish once while the camera zooms in.
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

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
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
  // Default companion name is Kira (matches Profile.displayCompanionName()).
  return identity?.companionName?.trim() || onboarding.companionName?.trim() || 'Kira'
}

export function FirstChat({
  reducedMotion,
  profile,
  onboarding,
  kira,
  camera,
  kiraNarrator,
  sound,
  onComplete,
}: {
  reducedMotion: boolean
  profile: unknown
  onboarding: { companionName?: string | null }
  kira: Kira | null | undefined
  camera: Camera | null | undefined
  kiraNarrator: KiraNarrator | null | undefined
  sound?: SoundLike | null | undefined
  onComplete: () => void
}) {
  const [visible, setVisible] = useState(reducedMotion)
  const zoomedRef = useRef(false)
  // Progression lives entirely in the bottom NarratorPanel — its single CTA
  // fires the next beat. These refs track where we are in the sequence so
  // callbacks captured by `speak()` can read the latest index.
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
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  // Run-once across StrictMode's dev double-mount WITHOUT killing the run:
  // the previous shape (startedRef + AbortController aborted in cleanup)
  // deadlocked under StrictMode — mount #1's cleanup aborted the intro and
  // the guard blocked mount #2 from retrying, so the ceremony never zoomed,
  // woke the bird, or spoke. StrictMode's remount is synchronous, so an
  // awaited step never observes the transient mounts === 0 state; only a
  // true unmount leaves `disposed` set.
  const runRef = useRef({ started: false, mounts: 0, disposed: false })

  useEffect(() => {
    const run = runRef.current
    run.mounts += 1
    run.disposed = false

    async function runIntro() {
      // Yield one macrotask before touching the engine: React runs child
      // effects before parent effects, so on a reload straight into this
      // stage the orchestrator's park effect (kira.setOnboardingMode(true) —
      // which hides the bird and resolves any in-flight script) fires AFTER
      // this effect. Starting the flyTo before the park would get the bird
      // re-hidden and the wake script killed. One tick also clears
      // StrictMode's synchronous unmount/remount replay of the park effect.
      await wait(0)
      if (run.disposed) return

      const reducedMotion = reducedMotionRef.current
      const kira = kiraRef.current
      const camera = cameraRef.current

      setVisible(true)

      // Camera cut: dolly straight down to a 3/4 portrait on the bird,
      // started immediately so the zoom and the wake flourish land together.
      // The silhouette is built facing local +X, so rotated by yaw around Y
      // the world face direction is (cos yaw, 0, -sin yaw). Yaw offset,
      // distance, and vertical tilt live in the camera-tuner preset.
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

      // Reveal the bird at its home perch (onboarding mode parked it there)
      // and let the wake flourish play through once — it wakes up, then talks.
      await (kira?.flyTo?.({
        endPos: {
          x: kira.perchX ?? 0,
          y: kira.perchY ?? 0,
          z: kira.perchZ ?? 0,
        },
        duration: SETTLE_DURATION_S,
        endYaw: kira.perchYaw,
        reducedMotion,
      }) ?? Promise.resolve())
      if (run.disposed) return

      // Small beat so the first line lands after the flourish + dolly have
      // settled rather than mid-motion.
      if (!reducedMotion) {
        await wait(SETTLE_HOLD_MS)
        if (run.disposed) return
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
      // The transcript's onboarding screens, shown one CTA tap at a time.
      // The final screen's CTA ends the ceremony ("I'll let you get started").
      beatsRef.current = [...ONBOARDING_COPY.kira.firstChatExplainer]
      beatIndexRef.current = 0
      kiraNarratorRef.current?.speak?.({
        text: line,
        cta: ONBOARDING_COPY.firstChatActions.chatMore,
        onConfirm: showNextBeat,
      })
    }

    function showNextBeat() {
      const beats = beatsRef.current
      const i = beatIndexRef.current
      if (i >= beats.length) {
        finish()
        return
      }
      const isLast = i === beats.length - 1
      beatIndexRef.current = i + 1
      kiraNarratorRef.current?.speak?.({
        text: beats[i] ?? '',
        cta: isLast
          ? ONBOARDING_COPY.firstChatActions.feel
          : ONBOARDING_COPY.firstChatActions.chatMore,
        onConfirm: isLast ? finish : showNextBeat,
      })
    }

    function finish() {
      kiraNarratorRef.current?.close?.()
      if (zoomedRef.current) {
        cameraRef.current?.restoreZoom?.(700)
        zoomedRef.current = false
      }
      onCompleteRef.current()
    }

    if (!run.started) {
      run.started = true
      void runIntro()
    }

    // Teardown only on a TRUE unmount: drop the panel cleanly if FirstChat
    // unmounts mid-flow (e.g. the user skips) and hand the camera anchor
    // back if the dolly already started, so a follow-on cinematic doesn't
    // restore to the wrong pose. Deferred one tick so StrictMode's
    // synchronous unmount/remount cycle re-increments `mounts` before the
    // check runs — a dev remount must NOT cancel the in-flight zoom/run.
    return () => {
      run.mounts -= 1
      window.setTimeout(() => {
        if (run.mounts > 0) return
        run.disposed = true
        kiraNarratorRef.current?.close?.()
        if (zoomedRef.current) {
          try {
            cameraRef.current?.restoreZoom?.(0)
          } catch {
            // restoreZoom is best-effort during teardown.
          }
          zoomedRef.current = false
        }
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
