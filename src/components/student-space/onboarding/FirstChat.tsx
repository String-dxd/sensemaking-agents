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
// Arrival beat (world-port U9): the character no longer flies in — it wakes
// on the west beach and walks (swims if the route crosses water) to its home
// perch. The start sits just off the landmass's west shore.
const FLY_DURATION_S = 8
const FLY_START = { x: -7.6, y: 0, z: 0.9 }
const FLY_MID_OFFSET = { x: 0, y: 0, z: 0 }

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
    startPos: typeof FLY_START
    endPos: { x: number; y: number; z: number }
    midOffset: typeof FLY_MID_OFFSET
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
  const zoomLeadTimerRef = useRef<number | null>(null)
  // Progression now lives entirely in the bottom NarratorPanel — its single
  // CTA fires the next beat. These refs track where we are in the sequence
  // so callbacks captured by `speak()` can read the latest index.
  const beatsRef = useRef<string[]>([])
  const beatIndexRef = useRef(0)
  // Cached so the unmount path can hand the camera anchor back if a late
  // zoomLead fire-and-forget already started the dolly.
  const cameraRef = useRef<Camera | null | undefined>(camera)
  cameraRef.current = camera

  useEffect(() => {
    const abort = new AbortController()
    abortRef.current = abort

    async function runIntro() {
      if (!reducedMotion) {
        const frame = requestAnimationFrame(() => setVisible(true))
        await wait(ENTER_MS, abort.signal)
        cancelAnimationFrame(frame)
      } else {
        setVisible(true)
      }
      if (abort.signal.aborted) return

      // Wing-pass whoosh as the bird crosses the frame — anchors the
      // off-canvas arrival to an audible cue.
      if (!reducedMotion) {
        try {
          sound?.playOneShot?.('whoosh')
        } catch {
          // SFX is best-effort; never break the ceremony on a missing sample.
        }
      }

      // Fly the bird in from off-canvas onto its perch and dolly the
      // camera toward the perch in parallel so the two motions resolve
      // together rather than reading as bird-lands → camera-zooms.
      const flyPromise =
        kira?.flyTo?.({
          startPos: FLY_START,
          endPos: {
            x: kira.perchX ?? 0,
            y: kira.perchY ?? 0,
            z: kira.perchZ ?? 0,
          },
          midOffset: FLY_MID_OFFSET,
          duration: FLY_DURATION_S,
          endYaw: kira.perchYaw,
          reducedMotion,
        }) ?? Promise.resolve()

      // Camera 3/4 portrait on Kira. The silhouette is built facing local
      // +X, so rotated by yaw around Y the world face direction is
      // (cos yaw, 0, -sin yaw). Yaw offset, distance, and vertical
      // tilt live in the camera-tuner preset.
      const preset = getPreset('first-chat')
      const { zoomLeadMs, durationMs, yawOffsetDeg, distance, camYAboveLookAt, lookAtYAbovePerch } =
        preset
      if (camera && kira && !reducedMotion) {
        // Kick the camera move off after the bird is past the apex of its
        // arc so the dolly lands a beat after the bird settles.
        zoomLeadTimerRef.current = window.setTimeout(() => {
          zoomLeadTimerRef.current = null
          if (abort.signal.aborted) return
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
        }, zoomLeadMs)
      }

      await flyPromise
      if (abort.signal.aborted) return

      // Wait out whatever portion of the camera move is still in flight
      // once the bird has landed, so the intro line lands after the camera
      // has settled (or close to it).
      const remaining = Math.max(0, zoomLeadMs + durationMs - FLY_DURATION_S * 1000)
      if (remaining > 0 && !reducedMotion) {
        await wait(remaining, abort.signal)
        if (abort.signal.aborted) return
      }

      const line = ONBOARDING_COPY.kira.firstChatIntro.replace(
        '{companionName}',
        companionNameFrom(profile, onboarding),
      )
      try {
        sound?.playOneShot?.('chime')
      } catch {
        // SFX best-effort; same rationale as above.
      }
      // The explainer beats make up the sequence the user walks through
      // one CTA tap at a time. Built once on intro so showNextBeat() can
      // advance via the index ref. The final beat hands off into the
      // first-capture stage; its CTA reads "Start first capture".
      beatsRef.current = [...ONBOARDING_COPY.kira.firstChatExplainer]
      beatIndexRef.current = 0
      kiraNarrator?.speak?.({
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
      kiraNarrator?.speak?.({
        text: beats[i] ?? '',
        cta: isLast ? ONBOARDING_COPY.firstChatActions.feel : 'Continue',
        onConfirm: isLast ? feelNow : showNextBeat,
      })
    }

    function feelNow() {
      kiraNarrator?.close?.()
      if (zoomedRef.current) {
        camera?.restoreZoom?.(700)
        zoomedRef.current = false
      }
      onAdvance()
    }

    return () => {
      abort.abort()
      if (zoomLeadTimerRef.current != null) {
        window.clearTimeout(zoomLeadTimerRef.current)
        zoomLeadTimerRef.current = null
      }
      // Drop the panel cleanly if FirstChat unmounts mid-flow (e.g. the user
      // navigates away). The narrator's own close handles camera restore.
      kiraNarrator?.close?.()
      // If the camera dolly already started, hand its save-stack entry
      // back to the camera so a follow-on cinematic doesn't restore to
      // the wrong pose (FirstChat would be the orphaned anchor).
      if (zoomedRef.current) {
        try {
          cameraRef.current?.restoreZoom?.(0)
        } catch {
          // restoreZoom is best-effort during teardown.
        }
        zoomedRef.current = false
      }
    }
  }, [camera, kira, kiraNarrator, onAdvance, onboarding, profile, reducedMotion, sound])

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
