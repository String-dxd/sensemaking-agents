import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
import { X } from 'lucide-react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { cn } from '~/lib/utils'

export type FacetSheetMoodPin = {
  emotion: string
  intensity: number
  entryDate?: string
  color: string
}

export type FacetSheetBentoRow = {
  label: string
  value: string
}

export type FacetSheetState = {
  open: boolean
  isFull: boolean
  facetId: string | null
  eyebrow: string
  tag: string
  title: string
  subtitle: string
  accent: string
  soft: string
  ink: string
  mostCommonLabel: string
  quietlyEmergingLabel: string
  detailTitle: string
  detailBody: string
  bentoRows: FacetSheetBentoRow[]
  moodPins: FacetSheetMoodPin[]
  ctaLabel: string
  ctaVisible: boolean
}

export const INITIAL_FACET_SHEET: FacetSheetState = {
  open: false,
  isFull: false,
  facetId: null,
  eyebrow: '',
  tag: '',
  title: '',
  subtitle: '',
  accent: '#A07659',
  soft: '#EAD7BE',
  ink: '#6A4A26',
  mostCommonLabel: '',
  quietlyEmergingLabel: '',
  detailTitle: '',
  detailBody: '',
  bentoRows: [],
  moodPins: [],
  ctaLabel: '',
  ctaVisible: false,
}

export function FacetSheetCard({
  state,
  onClose,
  onToggleFull,
  onOpenProfile,
}: {
  state: FacetSheetState
  onClose: () => void
  onToggleFull: () => void
  onOpenProfile: () => void
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') {
      if (!state.isFull) {
        event.preventDefault()
        onToggleFull()
      }
    } else if (event.key === 'ArrowDown') {
      if (state.isFull) {
        event.preventDefault()
        onToggleFull()
      }
    }
  }

  const themeVars: CSSProperties = {
    ['--facet-accent' as string]: state.accent,
    ['--facet-soft' as string]: state.soft,
    ['--facet-ink' as string]: state.ink,
  }

  const isMood = state.facetId === 'mood'

  return (
    <BaseDialog.Root open={state.open} onOpenChange={(open) => !open && onClose()} modal={false}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          data-facet-sheet-scrim
          className={cn(
            'fixed inset-0 z-[55] transition-[background-color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            state.isFull ? 'bg-black/48' : 'bg-black/32',
          )}
        />
        <BaseDialog.Popup
          data-facet-sheet
          onKeyDown={handleKeyDown}
          style={themeVars}
          className={cn(
            'fixed z-[57] flex flex-col overflow-hidden font-sans text-(--facet-ink) shadow-[0_-14px_38px_rgba(0,0,0,0.28)] outline-none',
            'bottom-0 left-0 right-0 mx-auto max-w-[min(100%,calc(100vw-var(--width-rail)-2*var(--inset-frame)))]',
            'rounded-t-[22px]',
            'transition-[height,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            state.isFull ? 'h-[92vh]' : 'h-[50vh]',
            'data-[starting-style]:translate-y-[calc(100%+24px)]',
            'data-[ending-style]:translate-y-[calc(100%+24px)]',
            'motion-reduce:transition-none',
          )}
        >
          {/* Gradient background; uses the inline --facet-soft for the bottom stop. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-b from-[#fdfaf3] to-(--facet-soft)"
          />
          <button
            type="button"
            aria-label={state.isFull ? 'Collapse to half view' : 'Expand to full page'}
            aria-expanded={state.isFull}
            onClick={onToggleFull}
            className="group relative mx-auto mt-1.5 block h-11 w-[72px] flex-shrink-0 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-(--facet-accent) focus-visible:outline-offset-2 focus-visible:rounded-[22px]"
          >
            <span
              aria-hidden
              className={cn(
                'absolute top-1/2 left-3.5 h-1 w-[22px] origin-[100%_50%] -translate-y-1/2 rounded-[4px] bg-black/22',
                'transition-[transform,background-color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                state.isFull
                  ? 'group-hover:-translate-y-1/2 group-hover:rotate-[22deg] group-hover:bg-black/42 group-focus-visible:-translate-y-1/2 group-focus-visible:rotate-[22deg] group-focus-visible:bg-black/42'
                  : 'group-hover:-translate-y-1/2 group-hover:-rotate-[22deg] group-hover:bg-black/42 group-focus-visible:-translate-y-1/2 group-focus-visible:-rotate-[22deg] group-focus-visible:bg-black/42',
              )}
            />
            <span
              aria-hidden
              className={cn(
                'absolute top-1/2 right-3.5 h-1 w-[22px] origin-[0%_50%] -translate-y-1/2 rounded-[4px] bg-black/22',
                'transition-[transform,background-color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                state.isFull
                  ? 'group-hover:-translate-y-1/2 group-hover:-rotate-[22deg] group-hover:bg-black/42 group-focus-visible:-translate-y-1/2 group-focus-visible:-rotate-[22deg] group-focus-visible:bg-black/42'
                  : 'group-hover:-translate-y-1/2 group-hover:rotate-[22deg] group-hover:bg-black/42 group-focus-visible:-translate-y-1/2 group-focus-visible:rotate-[22deg] group-focus-visible:bg-black/42',
              )}
            />
          </button>
          <BaseDialog.Close
            aria-label="Close"
            className="absolute top-3 right-3 z-10 grid size-10 cursor-pointer place-items-center rounded-full border-none bg-transparent text-(--facet-ink)/72 transition-colors hover:bg-black/10 hover:text-(--facet-ink) focus-visible:outline-2 focus-visible:outline-(--facet-accent) focus-visible:outline-offset-2 active:scale-95"
          >
            <X className="size-5" aria-hidden />
          </BaseDialog.Close>

          <div className="mx-auto box-border flex w-full max-w-[720px] flex-1 flex-col overflow-y-auto px-7 pt-3.5 pb-7">
            <header>
              <div className="mb-2 flex items-center gap-2.5">
                <BaseDialog.Title
                  render={<span />}
                  className="text-[11px] font-semibold text-[rgba(43,38,32,0.55)]"
                >
                  {state.eyebrow}
                </BaseDialog.Title>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-(--facet-ink)"
                  style={{
                    background: `color-mix(in srgb, var(--facet-accent) 18%, #fff)`,
                  }}
                >
                  {state.tag}
                </span>
              </div>
              <h2 className="my-1 mb-1.5 text-[clamp(26px,4vw,34px)] leading-[1.15] font-semibold tracking-[-0.01em]">
                {state.title}
              </h2>
              <p className="m-0 mb-[18px] text-sm leading-[1.45] text-(--facet-ink)/60">
                {state.subtitle}
              </p>
            </header>

            <ul className="mb-[22px] list-none border-t border-black/7 p-0">
              <li className="border-b border-black/7 px-0 pt-3.5 pb-3">
                <span className="mb-1 block text-[11px] font-semibold text-(--facet-accent)">
                  Most common
                </span>
                <p className="m-0 text-[15px] leading-[1.4] text-(--facet-ink)">
                  {state.mostCommonLabel}
                </p>
              </li>
              <li className="border-b border-black/7 px-0 pt-3.5 pb-3">
                <span className="mb-1 block text-[11px] font-semibold text-(--facet-accent)">
                  Quietly emerging
                </span>
                <p className="m-0 text-[15px] leading-[1.4] text-(--facet-ink)">
                  {state.quietlyEmergingLabel}
                </p>
              </li>
            </ul>

            <section
              className={cn(
                'mt-1 transition-[opacity,transform] duration-[280ms] ease-out motion-reduce:transition-none',
                state.isFull
                  ? 'pointer-events-auto translate-y-0 opacity-100'
                  : 'pointer-events-none translate-y-2 opacity-0',
              )}
              aria-hidden={!state.isFull}
            >
              <h3 className="my-0 mb-1.5 text-lg font-semibold">{state.detailTitle}</h3>
              <p className="m-0 mb-3.5 text-sm leading-[1.55] text-(--facet-ink)/85">
                {state.detailBody}
              </p>

              {isMood ? (
                <MoodPinGrid pins={state.moodPins} />
              ) : (
                <BentoRowGrid rows={state.bentoRows} />
              )}

              {state.ctaVisible ? (
                <button
                  type="button"
                  onClick={onOpenProfile}
                  className={cn(
                    'mt-[18px] self-start rounded-full px-[18px] py-2.5',
                    'border border-(--facet-accent)/50 bg-(--facet-accent)/14 text-(--facet-ink)',
                    'font-sans text-[13px] font-semibold tracking-[0.005em]',
                    'cursor-pointer transition-[background-color,border-color,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                    'hover:bg-(--facet-accent)/24 hover:border-(--facet-accent)',
                    'focus-visible:outline-2 focus-visible:outline-(--facet-accent) focus-visible:outline-offset-2',
                    'motion-reduce:transition-none',
                  )}
                  data-facet={state.facetId ?? ''}
                >
                  {state.ctaLabel}
                </button>
              ) : null}
            </section>
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

function BentoRowGrid({ rows }: { rows: FacetSheetBentoRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-2">
      {rows.map((row) => (
        <div
          key={`${row.label}-${row.value}`}
          className="flex items-baseline justify-between gap-3 rounded-[10px] bg-white/55 px-3 py-2.5"
        >
          <span className="flex-shrink-0 text-[11px] font-semibold text-(--facet-accent)">
            {row.label}
          </span>
          <span className="text-right text-[13px] text-(--facet-ink) opacity-92">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function MoodPinGrid({ pins }: { pins: FacetSheetMoodPin[] }) {
  if (pins.length === 0) {
    return (
      <p className="col-span-full px-3 py-[18px] text-center text-[13px] opacity-60">
        No mood pins yet — tap Capture to log one.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-2">
      {pins.map((pin, index) => (
        <div
          key={`${pin.emotion}-${pin.entryDate ?? index}`}
          className="flex items-center gap-3 rounded-[12px] bg-white/65 px-4 py-3.5"
        >
          <span
            aria-hidden
            className="size-3.5 flex-shrink-0 rounded-full"
            style={{ background: pin.color }}
          />
          <div>
            <div className="mb-0.5 text-[15px] font-medium capitalize">{pin.emotion}</div>
            <div className="m-0 text-[13px] opacity-70">
              {pin.intensity}/4
              {pin.entryDate ? ` · ${pin.entryDate}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
