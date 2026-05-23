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
const FLY_DURATION_S = 2.4
const INTRO_LINE_MS = 1800
const CHAT_MORE_MS = 1800
const FLY_START = { x: -14, y: 12, z: 8 }
const FLY_MID_OFFSET = { x: 0, y: 4, z: 0 }

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

type KiraDialogue = {
  sayOnboarding?: (line: string) => void
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
  kiraDialogue,
  sound,
  onAdvance,
}: {
  reducedMotion: boolean
  profile: unknown
  onboarding: { companionName?: string | null }
  kira: Kira | null | undefined
  camera: Camera | null | undefined
  kiraDialogue: KiraDialogue | null | undefined
  sound?: SoundLike | null | undefined
  onAdvance: () => void
}) {
  const [visible, setVisible] = useState(reducedMotion)
  const [chipsVisible, setChipsVisible] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [explainerSeen, setExplainerSeen] = useState(false)
  const zoomedRef = useRef(false)
  const primaryRef = useRef<HTMLButtonElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const zoomLeadTimerRef = useRef<number | null>(null)
  const chipFocusTimerRef = useRef<number | null>(null)
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
      kiraDialogue?.sayOnboarding?.(line)
      await wait(reducedMotion ? 80 : INTRO_LINE_MS, abort.signal)
      if (abort.signal.aborted) return
      setChipsVisible(true)
    }

    void runIntro()

    return () => {
      abort.abort()
      if (zoomLeadTimerRef.current != null) {
        window.clearTimeout(zoomLeadTimerRef.current)
        zoomLeadTimerRef.current = null
      }
      if (chipFocusTimerRef.current != null) {
        window.clearTimeout(chipFocusTimerRef.current)
        chipFocusTimerRef.current = null
      }
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
  }, [camera, kira, kiraDialogue, onboarding, profile, reducedMotion, sound])

  useEffect(() => {
    if (!chipsVisible || speaking) return
    if (chipFocusTimerRef.current != null) window.clearTimeout(chipFocusTimerRef.current)
    chipFocusTimerRef.current = window.setTimeout(() => {
      chipFocusTimerRef.current = null
      primaryRef.current?.focus({ preventScroll: true })
    }, 60)
    return () => {
      if (chipFocusTimerRef.current != null) {
        window.clearTimeout(chipFocusTimerRef.current)
        chipFocusTimerRef.current = null
      }
    }
  }, [chipsVisible, speaking])

  const chatMore = async () => {
    if (speaking) return
    setSpeaking(true)
    setChipsVisible(false)
    const abort = abortRef.current
    const signal = abort?.signal ?? new AbortController().signal
    // First tap plays the three-beat explainer so the student sees the
    // share → sprout → bloom mechanic before tagging anything. Repeat
    // taps fall back to the shorter "I'm listening" beat.
    const beats = explainerSeen
      ? [ONBOARDING_COPY.kira.firstChatChatMore]
      : ONBOARDING_COPY.kira.firstChatExplainer
    for (const line of beats) {
      kiraDialogue?.sayOnboarding?.(line)
      await wait(reducedMotion ? 80 : CHAT_MORE_MS, signal)
      if (signal.aborted) return
    }
    if (!explainerSeen) setExplainerSeen(true)
    kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.firstChatChatPrompt)
    setSpeaking(false)
    setChipsVisible(true)
  }

  const feelNow = () => {
    if (speaking) return
    setChipsVisible(false)
    if (zoomedRef.current) {
      camera?.restoreZoom?.(700)
      // Clear the latch so unmount doesn't re-enter restoreZoom on an
      // already-popped owner anchor.
      zoomedRef.current = false
    }
    onAdvance()
  }

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
      <fieldset
        hidden={!chipsVisible}
        className={cn(
          'm-0 border-0',
          'absolute left-1/2 bottom-[max(28px,env(safe-area-inset-bottom,0px))] z-[5]',
          '-translate-x-1/2 flex flex-wrap justify-center gap-2.5 px-4',
        )}
      >
        <legend className="sr-only">Talk with your companion</legend>
        <button
          type="button"
          onClick={() => void chatMore()}
          className={cn(
            'relative min-h-11 rounded-full border-[1.5px] border-[rgba(43,38,32,0.10)]',
            'bg-white/90 px-5 py-3 text-[15px] font-medium text-(--color-onb-ink)',
            'shadow-[0_6px_18px_rgba(15,18,36,0.22)] cursor-pointer',
            'transition-[transform,background,box-shadow] duration-150 ease-out hover:-translate-y-px hover:bg-white',
            'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
          )}
        >
          {ONBOARDING_COPY.firstChatActions.chatMore}
          {!explainerSeen && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute -top-1 -right-1 h-2 w-2 rounded-full',
                'bg-(--color-onb-accent) ring-2 ring-white',
                'motion-safe:animate-pulse',
              )}
            />
          )}
        </button>
        <button
          ref={primaryRef}
          type="button"
          onClick={feelNow}
          className={cn(
            'min-h-11 rounded-full border-[1.5px] border-transparent',
            'bg-(--color-onb-accent) px-5 py-3 text-[15px] font-medium text-white',
            'shadow-[0_8px_20px_rgba(255,138,92,0.32)] cursor-pointer',
            'transition-[transform,background,box-shadow] duration-150 ease-out hover:-translate-y-px hover:bg-(--onb-accent-deep)',
            'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
          )}
        >
          {ONBOARDING_COPY.firstChatActions.feel}
        </button>
      </fieldset>
    </div>
  )
}
