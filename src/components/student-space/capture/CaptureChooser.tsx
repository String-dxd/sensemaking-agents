import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
import { Heart, MessageCircle, X } from 'lucide-react'
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

  return (
    <BaseDialog.Root
      open={overlay.activeChooser}
      onOpenChange={(open) => {
        if (!open) overlay.setActiveChooser(false)
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          data-testid="capture-chooser-backdrop"
          className={cn(
            'fixed inset-0 z-40 bg-[rgba(15,18,36,0.26)] backdrop-blur-[2px]',
            'transition-opacity duration-(--duration-base) ease-(--ease-out) motion-reduce:transition-none',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
          )}
        />
        <BaseDialog.Popup
          data-testid="capture-chooser"
          aria-labelledby="capture-chooser-title"
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[84vh] w-full max-w-3xl flex-col rounded-t-[28px] border border-white/45 bg-[#fffdf6]/95 p-5 shadow-[0_-18px_48px_rgba(15,18,36,0.30)]',
            'transition-[transform,opacity] duration-(--duration-base) ease-(--ease-out) motion-reduce:transition-none',
            'data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0',
            'data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <BaseDialog.Title
              id="capture-chooser-title"
              className="m-0 text-lg font-semibold text-[rgba(43,38,32,0.92)]"
            >
              Capture
            </BaseDialog.Title>
            <BaseDialog.Close
              aria-label="Close capture"
              className="grid size-9 cursor-pointer place-items-center rounded-full text-[rgba(43,38,32,0.62)] transition-colors duration-(--duration-fast) ease-(--ease) hover:bg-black/5 focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)]"
            >
              <X aria-hidden className="size-5" />
            </BaseDialog.Close>
          </div>
          <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
            {MODES.map((mode) => {
              const Icon = mode.icon
              return (
                <li key={mode.id}>
                  <button
                    type="button"
                    aria-label={mode.label}
                    onClick={() => overlay.openCapture(mode.id)}
                    className={cn(
                      'group flex h-full min-h-44 w-full flex-col items-start justify-between overflow-hidden rounded-3xl border border-[rgba(43,38,32,0.10)] bg-white p-5 text-left shadow-[0_10px_28px_rgba(15,18,36,0.12)]',
                      'transition-[transform,box-shadow] duration-(--duration-fast) ease-(--ease-out) hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,18,36,0.18)] active:scale-[0.98] motion-reduce:active:scale-100',
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
                      <span className="text-sm leading-5 text-[rgba(43,38,32,0.62)]">
                        {mode.sub}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
