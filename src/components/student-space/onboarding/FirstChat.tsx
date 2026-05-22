import { useEffect, useRef, useState } from 'react'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { cn } from '~/lib/utils'

/**
 * Post-hatch chat beat (U17 React rewrite of
 * React first-chat surface for the onboarding ceremony.
 *
 * The canvas still owns Kira and the camera. This component owns the DOM
 * sheen, action chips, and timing that asks Kira to fly in, speak, zoom, and
 * then hand off to the first-mood picker.
 */
const ENTER_MS = 320
const FLY_DURATION_S = 2.4
const ZOOM_MS = 1200
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
  onAdvance,
}: {
  reducedMotion: boolean
  profile: unknown
  onboarding: { companionName?: string | null }
  kira: Kira | null | undefined
  camera: Camera | null | undefined
  kiraDialogue: KiraDialogue | null | undefined
  onAdvance: () => void
}) {
  const [visible, setVisible] = useState(reducedMotion)
  const [chipsVisible, setChipsVisible] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const zoomedRef = useRef(false)
  const primaryRef = useRef<HTMLButtonElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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

      await kira?.flyTo?.({
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
      })
      if (abort.signal.aborted) return

      if (camera && kira && !reducedMotion) {
        const lookAt = makeVector(
          camera,
          kira.perchX ?? 0,
          (kira.perchY ?? 0) + 0.55,
          kira.perchZ ?? 0,
        )
        const yaw = kira.perchYaw ?? 0
        const fx = Math.cos(yaw)
        const fz = -Math.sin(yaw)
        const camPos = makeVector(
          camera,
          (kira.perchX ?? 0) + fx * 1.6,
          (kira.perchY ?? 0) + 0.9,
          (kira.perchZ ?? 0) + fz * 1.6,
        )
        if (lookAt && camPos) {
          camera.zoomTo?.(camPos, lookAt, ZOOM_MS)
          zoomedRef.current = true
          await wait(ZOOM_MS, abort.signal)
        }
      }
      if (abort.signal.aborted) return

      const line = ONBOARDING_COPY.kira.firstChatIntro.replace(
        '{companionName}',
        companionNameFrom(profile, onboarding),
      )
      kiraDialogue?.sayOnboarding?.(line)
      await wait(reducedMotion ? 80 : INTRO_LINE_MS, abort.signal)
      if (abort.signal.aborted) return
      setChipsVisible(true)
    }

    void runIntro()

    return () => {
      abort.abort()
    }
  }, [camera, kira, kiraDialogue, onboarding, profile, reducedMotion])

  useEffect(() => {
    if (!chipsVisible || speaking) return
    const id = window.setTimeout(() => primaryRef.current?.focus({ preventScroll: true }), 60)
    return () => window.clearTimeout(id)
  }, [chipsVisible, speaking])

  const chatMore = async () => {
    if (speaking) return
    setSpeaking(true)
    setChipsVisible(false)
    kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.firstChatChatMore)
    const abort = abortRef.current
    await wait(reducedMotion ? 80 : CHAT_MORE_MS, abort?.signal ?? new AbortController().signal)
    if (abort?.signal.aborted) return
    kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.firstChatChatPrompt)
    setSpeaking(false)
    setChipsVisible(true)
  }

  const feelNow = () => {
    if (speaking) return
    setChipsVisible(false)
    if (zoomedRef.current) camera?.restoreZoom?.(700)
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
            'min-h-11 rounded-full border-[1.5px] border-[rgba(43,38,32,0.10)]',
            'bg-white/90 px-5 py-3 text-[15px] font-medium text-(--color-onb-ink)',
            'shadow-[0_6px_18px_rgba(15,18,36,0.22)] cursor-pointer',
            'transition-[transform,background,box-shadow] duration-150 ease-out hover:-translate-y-px hover:bg-white',
            'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
          )}
        >
          {ONBOARDING_COPY.firstChatActions.chatMore}
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
