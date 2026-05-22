import { ChevronLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '~/components/ui/drawer'
import { EMOTIONS, type EmotionEntry, shapeDataUri } from '~/lib/student-space/mood-shapes'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { cn } from '~/lib/utils'

const INTENSITIES = [
  { value: 1, label: 'whisper' },
  { value: 2, label: 'talking' },
  { value: 3, label: 'loud' },
  { value: 4, label: 'running the show' },
]

const CAUSES = [
  { id: 'school', label: 'school' },
  { id: 'friends', label: 'friends' },
  { id: 'family', label: 'family' },
  { id: 'social', label: 'social media' },
  { id: 'body', label: 'body' },
  { id: 'achievement', label: 'achievement' },
  { id: 'uncertainty', label: 'uncertainty' },
  { id: 'alone', label: 'alone time' },
  { id: 'gratitude', label: 'gratitude' },
  { id: 'other', label: 'something else' },
]

type MoodPin = {
  id: string
  emotion: string
  intensity: number
  cause?: string | null
}

type GameWithMood = {
  state?: {
    moodPins?: {
      add?: (input: { emotion: string; intensity: number }) => MoodPin
      patch?: (id: string, updates: { cause: string }) => unknown
    }
    day?: { setMood?: (emotion: string) => void }
  }
  view?: { overlayController?: { noteClosed?: (name: string) => void } }
}

export function MoodSheet() {
  const engine = useEngine() as GameWithMood | null
  const overlay = useEngineOverlay()
  const options = overlay.activeCapture === 'mood' ? overlay.activeCaptureOptions : null
  const readOnly = Boolean(options?.readOnly)
  const readOnlyPin = options?.pin as MoodPin | undefined
  const open = overlay.activeCapture === 'mood'
  const [step, setStep] = useState<'emotion' | 'intensity' | 'cause'>('emotion')
  const [emotion, setEmotion] = useState<string | null>(null)
  const [intensity, setIntensity] = useState<number | null>(null)
  const [pinId, setPinId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setEmotion(readOnlyPin?.emotion ?? null)
    setIntensity(readOnlyPin?.intensity ?? null)
    setPinId(readOnlyPin?.id ?? null)
    setStep(readOnlyPin ? 'cause' : 'emotion')
  }, [open, readOnlyPin])

  const pickedEmotion = useMemo(
    () => EMOTIONS.find((entry) => entry.id === emotion) ?? null,
    [emotion],
  )

  function close({ chooser = false }: { chooser?: boolean } = {}) {
    overlay.closeCapture()
    engine?.view?.overlayController?.noteClosed?.('mood')
    if (chooser) overlay.setActiveChooser(true)
  }

  function handleBack() {
    if (!open) return
    close({ chooser: !readOnly })
  }

  function pickEmotion(next: string) {
    if (readOnly) return
    setEmotion(next)
    window.setTimeout(() => setStep('intensity'), 220)
  }

  function pickIntensity(next: number) {
    if (!emotion || readOnly) return
    setIntensity(next)
    const pin = engine?.state?.moodPins?.add?.({ emotion, intensity: next })
    if (pin?.id) setPinId(pin.id)
    engine?.state?.day?.setMood?.(emotion)
    window.setTimeout(() => setStep('cause'), 320)
  }

  function pickCause(cause: string) {
    if (!pinId || readOnly) return
    engine?.state?.moodPins?.patch?.(pinId, { cause })
    window.setTimeout(() => close(), 260)
  }

  return (
    <Drawer open={open} onOpenChange={(next) => (!next ? handleBack() : null)}>
      <DrawerContent
        closeLabel={readOnly ? 'Close' : 'Back'}
        className="max-w-2xl bg-[#fffdf6] text-[rgba(43,38,32,0.92)]"
      >
        <DrawerTitle className="sr-only">Name a feeling</DrawerTitle>
        <DrawerDescription className="sr-only">
          Capture a mood by choosing an emotion, intensity, and optional cause.
        </DrawerDescription>
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
          <header className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              aria-label={readOnly ? 'Close' : 'Back'}
              className="grid size-9 place-items-center rounded-full text-[rgba(43,38,32,0.62)] hover:bg-black/5 focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)]"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <div className="flex gap-1.5" aria-hidden="true">
              {['emotion', 'intensity', 'cause'].map((dot) => (
                <span
                  key={dot}
                  className={cn(
                    'size-2 rounded-full bg-[rgba(43,38,32,0.18)]',
                    (dot === 'emotion' ||
                      (dot === 'intensity' && step !== 'emotion') ||
                      (dot === 'cause' && step === 'cause')) &&
                      'bg-(--color-onb-accent)',
                  )}
                />
              ))}
            </div>
            <span className="text-xs font-semibold text-[rgba(43,38,32,0.48)]">Only you</span>
          </header>

          {step === 'emotion' ? (
            <section>
              <h2 className="m-0 text-2xl font-semibold">Who's at the console right now?</h2>
              <p className="mt-1 mb-5 text-sm text-[rgba(43,38,32,0.62)]">Pick the loudest one.</p>
              <div className="grid grid-cols-3 gap-2.5">
                {EMOTIONS.map((entry) => (
                  <EmotionButton
                    key={entry.id}
                    emotion={entry}
                    picked={emotion === entry.id}
                    onClick={() => pickEmotion(entry.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {step === 'intensity' ? (
            <section>
              <h2 className="m-0 text-2xl font-semibold">How loud?</h2>
              <p className="mt-1 mb-5 text-sm text-[rgba(43,38,32,0.62)]">Tap to save.</p>
              <div className="grid gap-2.5">
                {INTENSITIES.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    aria-pressed={intensity === entry.value}
                    onClick={() => pickIntensity(entry.value)}
                    className={cn(
                      'flex min-h-14 items-center justify-between rounded-2xl border border-[rgba(43,38,32,0.10)] bg-white/72 px-4 text-left shadow-sm',
                      'transition-[transform,border-color,background] duration-150 hover:-translate-y-px hover:bg-white',
                      intensity === entry.value && 'border-(--color-onb-accent) bg-white',
                    )}
                  >
                    <span className="font-semibold">{entry.label}</span>
                    <span className="flex gap-1" aria-hidden="true">
                      {Array.from({ length: entry.value }, (_, dot) => dot + 1).map((dot) => (
                        <span
                          key={`intensity-${entry.value}-dot-${dot}`}
                          className="size-2 rounded-full bg-(--color-onb-accent)"
                        />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 'cause' ? (
            <section>
              <h2 className="m-0 text-2xl font-semibold">Want to add what's behind it?</h2>
              <p className="mt-1 mb-5 text-sm text-[rgba(43,38,32,0.62)]">
                Optional — your pin is already saved.
              </p>
              {pickedEmotion ? (
                <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/72 p-3">
                  <img className="size-10" src={shapeDataUri(pickedEmotion)} alt="" />
                  <span className="text-sm font-semibold">
                    {pickedEmotion.label}
                    {intensity
                      ? `, ${INTENSITIES.find((item) => item.value === intensity)?.label}`
                      : ''}
                  </span>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {CAUSES.map((cause) => (
                  <button
                    key={cause.id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => pickCause(cause.id)}
                    className="min-h-10 rounded-full border border-[rgba(43,38,32,0.10)] bg-white/72 px-4 text-sm font-semibold text-[rgba(43,38,32,0.78)] transition-colors hover:bg-white disabled:cursor-default disabled:opacity-60"
                  >
                    {cause.label}
                  </button>
                ))}
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => close()}
                  className="mt-5 min-h-11 rounded-full px-4 text-sm font-semibold text-[rgba(43,38,32,0.54)] hover:bg-black/5"
                >
                  Skip
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function EmotionButton({
  emotion,
  picked,
  onClick,
}: {
  emotion: EmotionEntry
  picked: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onClick}
      data-testid={`mood-sheet-emotion-${emotion.id}`}
      className={cn(
        'flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 bg-white/68 p-2 text-center shadow-sm',
        'transition-[transform,border-color,background] duration-150 hover:-translate-y-px hover:bg-white',
        picked ? 'border-(--color-onb-accent) bg-white' : 'border-transparent',
      )}
    >
      <img className="size-10" src={shapeDataUri(emotion)} alt="" aria-hidden="true" />
      <span className="text-xs font-semibold">{emotion.label}</span>
    </button>
  )
}
