import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { EMOTIONS, type EmotionEntry, shapeDataUri } from '~/lib/student-space/mood-shapes'
import { cn } from '~/lib/utils'

/**
 * Stripped 1-step mood capture (U17 React rewrite of
 * React first-mood surface for the onboarding ceremony.
 *
 * On tap: `moodPins.add({ emotion, intensity: 2 })` → record the new pin id
 * on the onboarding slice → tint the sky via `day.setMood` → swap the Kira
 * bubble to the acknowledgement line → advance to `first-grow`.
 * Intensity defaults to 2 ("talking"); the onboarding skips the intensity
 * question by design.
 */
const ENTER_MS = 320
const PICK_HOLD_MS = 1200
const PATIENCE_MS = 60_000

type MoodPinsSlice = {
  add: (input: { emotion: string; intensity: number }) => { id?: string } | null
}

type OnboardingSlice = {
  setFirstMoodPinId?: (pinId: string) => void
}

type DaySlice = {
  setMood?: (emotion: string) => void
}

type KiraDialogue = {
  sayOnboarding?: (line: string) => void
}

type CameraLike = {
  restoreZoom?: (duration: number) => void
  resetToDefault?: (duration: number) => void
}

export function FirstMood({
  reducedMotion,
  moodPins,
  onboarding,
  day,
  kiraDialogue,
  camera,
  onAdvance,
}: {
  reducedMotion: boolean
  moodPins: MoodPinsSlice | null | undefined
  onboarding: OnboardingSlice | null | undefined
  day: DaySlice | null | undefined
  kiraDialogue: KiraDialogue | null | undefined
  camera?: CameraLike | null
  onAdvance: () => void
}) {
  const [visible, setVisible] = useState(reducedMotion)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string>(() => {
    const first = (EMOTIONS as ReadonlyArray<EmotionEntry>)[0]
    return first?.id ?? ''
  })
  const committedRef = useRef(false)
  const tilesRef = useRef<Map<string, HTMLButtonElement>>(new Map())
  const advanceTimeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (advanceTimeoutRef.current != null) window.clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    },
    [],
  )

  // Fade-in on mount.
  useEffect(() => {
    if (reducedMotion) return
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [reducedMotion])

  // Ease the camera back to a wide pose when the picker appears. The
  // previous stage (FirstChat) had the camera in a close-up dolly anchored
  // to Kira's perch; without this the picker would render over a still-
  // zoomed scene. `restoreZoom` pops the FirstChat anchor and tweens home;
  // if there's no saved anchor (e.g. reduced-motion path skipped the
  // dolly), `resetToDefault` is the fallback.
  useEffect(() => {
    if (!camera) return
    if (reducedMotion) {
      camera.restoreZoom?.(0)
      camera.resetToDefault?.(0)
      return
    }
    camera.restoreZoom?.(700)
    camera.resetToDefault?.(700)
  }, [camera, reducedMotion])

  // Soft fallback — Kira says a patience line if the student stalls.
  useEffect(() => {
    const t = setTimeout(() => {
      if (committedRef.current) return
      kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.firstMoodPatience)
    }, PATIENCE_MS)
    return () => clearTimeout(t)
  }, [kiraDialogue])

  // Keep focus in sync with the roving-tabindex tile.
  useEffect(() => {
    const node = tilesRef.current.get(focusedId)
    node?.focus({ preventScroll: true })
  }, [focusedId])

  const handlePick = (emotionId: string) => {
    if (committedRef.current) return
    const emotion = (EMOTIONS as ReadonlyArray<EmotionEntry>).find((e) => e.id === emotionId)
    if (!emotion) return
    committedRef.current = true
    setPickedId(emotionId)
    // Commit the pin via the engine slice. Backend hydration may resolve
    // later but the local id is enough to fast-forward future boots.
    const pin = moodPins?.add({ emotion: emotionId, intensity: 2 })
    if (pin?.id) onboarding?.setFirstMoodPinId?.(pin.id)
    day?.setMood?.(emotionId)
    kiraDialogue?.sayOnboarding?.(ONBOARDING_COPY.kira.firstMoodAck)
    advanceTimeoutRef.current = window.setTimeout(
      () => {
        advanceTimeoutRef.current = null
        if (committedRef.current) onAdvance()
      },
      reducedMotion ? 80 : PICK_HOLD_MS,
    )
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (committedRef.current) return
    const key = event.key
    if (key === ' ' || key === 'Enter') {
      event.preventDefault()
      handlePick(focusedId)
      return
    }
    let step = 0
    if (key === 'ArrowLeft') step = -1
    else if (key === 'ArrowRight') step = 1
    else if (key === 'ArrowUp') step = -3
    else if (key === 'ArrowDown') step = 3
    if (!step) return
    event.preventDefault()
    const list = EMOTIONS as ReadonlyArray<EmotionEntry>
    const idx = list.findIndex((e) => e.id === focusedId)
    if (idx < 0) return
    const next = list[(idx + step + list.length) % list.length]
    if (next) setFocusedId(next.id)
  }

  return (
    <div
      data-testid="onboarding-first-mood"
      className={cn(
        'absolute inset-0 flex flex-col justify-end',
        'px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
        'bg-[rgba(15,18,36,0.20)]',
        'transition-opacity duration-[320ms] ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{ transitionDuration: `${ENTER_MS}ms` }}
    >
      <div
        className={cn(
          'relative mx-auto w-full max-w-[460px]',
          'rounded-t-3xl rounded-b-2xl p-[22px_18px_18px]',
          'bg-(--color-onb-card) text-(--color-onb-ink) shadow-[0_18px_44px_rgba(15,18,36,0.32)]',
        )}
      >
        <h2 className="m-0 mb-1 text-center text-lg font-medium">
          {ONBOARDING_COPY.firstMood.title}
        </h2>
        <p className="m-0 mb-4 text-center text-[13px] text-(--color-onb-ink-soft)">
          {ONBOARDING_COPY.firstMood.sub}
        </p>
        <fieldset className="m-0 grid grid-cols-3 gap-2.5 border-0 p-0" onKeyDown={handleKeyDown}>
          <legend className="sr-only">{ONBOARDING_COPY.firstMood.title}</legend>
          {(EMOTIONS as ReadonlyArray<EmotionEntry>).map((emotion) => {
            const picked = pickedId === emotion.id
            return (
              <button
                key={emotion.id}
                ref={(node) => {
                  if (node) tilesRef.current.set(emotion.id, node)
                  else tilesRef.current.delete(emotion.id)
                }}
                type="button"
                aria-pressed={picked}
                aria-label={emotion.label}
                data-testid={`mood-tile-${emotion.id}`}
                data-emotion={emotion.id}
                tabIndex={emotion.id === focusedId ? 0 : -1}
                onClick={() => handlePick(emotion.id)}
                onFocus={() => setFocusedId(emotion.id)}
                className={cn(
                  'flex min-h-[88px] flex-col items-center justify-center gap-1',
                  'rounded-2xl border-2 p-[8px_6px_6px] bg-white/60 cursor-pointer',
                  'transition-[transform,border-color,background] duration-[180ms] ease-out',
                  picked
                    ? 'border-(--color-onb-accent) bg-white shadow-[0_18px_44px_rgba(15,18,36,0.32)]'
                    : 'border-transparent',
                  'hover:-translate-y-px',
                  'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
                )}
              >
                <img className="h-9 w-9" src={shapeDataUri(emotion)} alt="" aria-hidden="true" />
                <span className="text-xs font-medium text-(--color-onb-ink)">{emotion.label}</span>
              </button>
            )
          })}
        </fieldset>
      </div>
    </div>
  )
}
