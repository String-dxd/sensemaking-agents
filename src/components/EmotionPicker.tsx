/**
 * U6 — 3×3 emotion picker. Two layout modes:
 *  - `standalone` — full-width grid, no overlay chrome. Not used this
 *    plan but exposed for future surfaces.
 *  - `overlay` — compact mode anchored to a popover/chip; renders a
 *    semi-transparent backdrop and a small floating card.
 *
 * Tile selection + roving focus + arrow-key + Home/End navigation +
 * aria-checked semantics live in Base UI's RadioGroup primitive — the
 * picker is just a styled wrapper around `<RadioGroup>` + `<Radio.Root>`.
 */
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
import { Radio } from '@base-ui-components/react/radio'
import { useState } from 'react'
import { type Mood, MoodSchema } from '~/agents/tools/schemas'
import { RadioGroup } from '~/components/ui/radio-group'
import { cn } from '~/lib/utils'

const LOCAL_STORAGE_KEY = 'sensemaking.mood.last_used'

export type MoodTileShape =
  | 'circle'
  | 'drop'
  | 'diamond'
  | 'cube'
  | 'ring'
  | 'capsule'
  | 'ellipse'
  | 'stepped-blocks'
  | 'disk'

interface TileMeta {
  value: Mood
  label: string
  shape: MoodTileShape
}

const TILES: TileMeta[] = [
  { value: 'joy', label: 'Joy', shape: 'circle' },
  { value: 'sadness', label: 'Sadness', shape: 'drop' },
  { value: 'anger', label: 'Anger', shape: 'diamond' },
  { value: 'fear', label: 'Fear', shape: 'cube' },
  { value: 'disgust', label: 'Disgust', shape: 'ring' },
  { value: 'anxiety', label: 'Anxiety', shape: 'capsule' },
  { value: 'envy', label: 'Envy', shape: 'ellipse' },
  { value: 'embarrassed', label: 'Embarrassed', shape: 'stepped-blocks' },
  { value: 'ennui', label: 'Ennui', shape: 'disk' },
]

export const EMOTION_TILES = TILES

function readLastUsed(): Mood {
  if (typeof window === 'undefined') return 'joy'
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    const parsed = raw ? MoodSchema.safeParse(raw) : null
    if (parsed?.success) return parsed.data
  } catch {
    /* ignore */
  }
  return 'joy'
}

export interface EmotionPickerProps {
  onSelect: (mood: Mood) => void
  defaultValue?: Mood
  layout?: 'standalone' | 'overlay'
  /** Called when the user dismisses the overlay (backdrop tap / Escape). */
  onDismiss?: () => void
}

export function EmotionPicker({
  onSelect,
  defaultValue,
  layout = 'standalone',
  onDismiss,
}: EmotionPickerProps) {
  const [selected, setSelected] = useState<Mood>(() => defaultValue ?? readLastUsed())

  function handleChange(value: unknown) {
    // Base UI's `RadioGroup.onValueChange` types the payload as `unknown`.
    // Narrow against the canonical enum before committing.
    const parsed = MoodSchema.safeParse(value)
    if (!parsed.success) return
    const next = parsed.data
    setSelected(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, next)
      } catch {
        /* best-effort */
      }
    }
    onSelect(next)
  }

  const grid = (
    <RadioGroup
      aria-label="Who's at the console?"
      data-testid="emotion-picker"
      value={selected}
      onValueChange={handleChange}
      className="grid grid-cols-3 gap-3"
    >
      {TILES.map((tile) => {
        const isSelected = selected === tile.value
        return (
          <Radio.Root
            key={tile.value}
            value={tile.value}
            data-testid={`emotion-tile-${tile.value}`}
            data-selected={isSelected ? 'true' : 'false'}
            className={cn(
              'flex aspect-square h-auto cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-background p-3 transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'data-[checked]:ring-2 data-[checked]:ring-accent',
            )}
          >
            <MoodShape shape={tile.shape} />
            <span className="text-xs font-medium">{tile.label}</span>
          </Radio.Root>
        )
      })}
    </RadioGroup>
  )

  if (layout === 'overlay') {
    // Base UI Dialog owns focus trap, Escape close, scroll lock, and backdrop
    // click dismissal — keep the same testids for behavior continuity with
    // the previous hand-rolled overlay.
    return (
      <BaseDialog.Root
        open
        onOpenChange={(open) => {
          if (!open) onDismiss?.()
        }}
      >
        <BaseDialog.Portal>
          <BaseDialog.Backdrop
            data-testid="emotion-picker-backdrop"
            className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          />
          <BaseDialog.Popup
            data-testid="emotion-picker-overlay"
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-4 shadow-2xl transition-all duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
          >
            <BaseDialog.Title className="sr-only">Pick an emotion</BaseDialog.Title>
            {grid}
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    )
  }

  return grid
}

function MoodShape({ shape }: { shape: MoodTileShape }) {
  const baseClasses = 'inline-block bg-accent/40'
  switch (shape) {
    case 'circle':
      return <span aria-hidden className={cn(baseClasses, 'h-8 w-8 rounded-full')} />
    case 'drop':
      return (
        <span
          aria-hidden
          className={cn(baseClasses, 'h-9 w-7 rounded-b-full rounded-t-sm rotate-180')}
        />
      )
    case 'diamond':
      return <span aria-hidden className={cn(baseClasses, 'h-7 w-7 rotate-45')} />
    case 'cube':
      return <span aria-hidden className={cn(baseClasses, 'h-7 w-7 rounded-sm')} />
    case 'ring':
      return (
        <span
          aria-hidden
          className={cn('inline-block h-8 w-8 rounded-full border-4 border-accent/40')}
        />
      )
    case 'capsule':
      return <span aria-hidden className={cn(baseClasses, 'h-4 w-8 rounded-full')} />
    case 'ellipse':
      return <span aria-hidden className={cn(baseClasses, 'h-5 w-8 rounded-full')} />
    case 'stepped-blocks':
      return (
        <span aria-hidden className="inline-flex flex-col gap-0.5">
          <span className={cn(baseClasses, 'h-2 w-4')} />
          <span className={cn(baseClasses, 'h-2 w-6')} />
          <span className={cn(baseClasses, 'h-2 w-8')} />
        </span>
      )
    case 'disk':
      return <span aria-hidden className={cn(baseClasses, 'h-2.5 w-8 rounded-sm')} />
  }
}
