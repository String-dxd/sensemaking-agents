import { Heart, MessageCircle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { cn } from '~/lib/utils'

const MODES = [
  {
    id: 'ask' as const,
    label: 'Open chat',
    sub: 'Talk it out — type or voice. Ramble. Loop back.',
    icon: MessageCircle,
    tone: 'from-[#6FC2B3] to-[#D8F5EC]',
  },
  {
    id: 'mood' as const,
    label: 'Name a feeling',
    sub: 'Just the loudest one.',
    icon: Heart,
    tone: 'from-[#E85973] to-[#FCE0E6]',
  },
]

export function CaptureChooser() {
  const overlay = useEngineOverlay()
  const firstButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!overlay.activeChooser) return
    const id = window.setTimeout(() => firstButtonRef.current?.focus({ preventScroll: true }), 80)
    return () => window.clearTimeout(id)
  }, [overlay.activeChooser])

  useEffect(() => {
    if (!overlay.activeChooser) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') overlay.setActiveChooser(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay])

  if (!overlay.activeChooser) return null

  return (
    <div
      data-testid="capture-chooser"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-chooser-title"
      className="fixed inset-0 z-40 bg-[rgba(15,18,36,0.26)] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) overlay.setActiveChooser(false)
      }}
    >
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[84vh] w-full max-w-3xl flex-col rounded-t-[28px] border border-white/45 bg-[#fffdf6]/95 p-5 shadow-[0_-18px_48px_rgba(15,18,36,0.30)]">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="capture-chooser-title"
            className="m-0 text-lg font-semibold text-[rgba(43,38,32,0.92)]"
          >
            Capture
          </h2>
          <button
            type="button"
            aria-label="Close capture"
            onClick={() => overlay.setActiveChooser(false)}
            className="grid size-9 place-items-center rounded-full text-[rgba(43,38,32,0.62)] transition-colors hover:bg-black/5 focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)]"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
          {MODES.map((mode, index) => {
            const Icon = mode.icon
            return (
              <li key={mode.id}>
                <button
                  ref={index === 0 ? firstButtonRef : undefined}
                  type="button"
                  aria-label={mode.label}
                  onClick={() => overlay.openCapture(mode.id)}
                  className={cn(
                    'group flex h-full min-h-44 w-full flex-col items-start justify-between overflow-hidden rounded-3xl border border-[rgba(43,38,32,0.10)] bg-white p-5 text-left shadow-[0_10px_28px_rgba(15,18,36,0.12)]',
                    'transition-[transform,box-shadow] duration-150 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,18,36,0.18)]',
                    'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-16 place-items-center rounded-3xl bg-linear-to-br text-white shadow-inner',
                      mode.tone,
                    )}
                  >
                    <Icon aria-hidden className="size-8" />
                  </span>
                  <span className="mt-6 flex flex-col gap-1">
                    <span className="text-base font-semibold text-[rgba(43,38,32,0.92)]">
                      {mode.label}
                    </span>
                    <span className="text-sm leading-5 text-[rgba(43,38,32,0.62)]">{mode.sub}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
