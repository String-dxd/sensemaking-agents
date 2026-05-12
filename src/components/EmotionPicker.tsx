/**
 * U6 — 3×3 emotion picker. Two layout modes:
 *  - `standalone` — full-width grid, no overlay chrome. Not used this
 *    plan but exposed for future surfaces.
 *  - `overlay` — compact mode anchored to a popover/chip; renders a
 *    semi-transparent backdrop and a small floating card.
 *
 * The 9 labels match the screenshot intent (Joy / Sadness / Anger /
 * Fear / Disgust / Anxiety / Envy / Embarrassed / Ennui) and are pinned
 * to the canonical `MoodSchema` enum. Shape↔emotion pairing is fixed in
 * `TILES` and lives in this file as a design specification; polish
 * swaps the shape primitives for final illustrations without changing
 * the data structure (§10b of the plan).
 */
import { useEffect, useRef, useState } from 'react'
import { type Mood, MoodSchema } from '~/agents/tools/schemas'
import { Button } from '~/components/ui/button'
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
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Escape closes the overlay variant.
  useEffect(() => {
    if (layout !== 'overlay' || !onDismiss) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layout, onDismiss])

  function handleSelect(value: Mood) {
    setSelected(value)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, value)
      } catch {
        /* best-effort */
      }
    }
    onSelect(value)
  }

  function handleKey(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const cols = 3
    const total = TILES.length
    let next = index
    switch (e.key) {
      case 'ArrowRight':
        next = (index + 1) % total
        break
      case 'ArrowLeft':
        next = (index - 1 + total) % total
        break
      case 'ArrowDown':
        next = (index + cols) % total
        break
      case 'ArrowUp':
        next = (index - cols + total) % total
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = total - 1
        break
      default:
        return
    }
    e.preventDefault()
    const tiles = containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    tiles?.[next]?.focus()
  }

  const grid = (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Who's at the console?"
      data-testid="emotion-picker"
      className="grid grid-cols-3 gap-3"
    >
      {TILES.map((tile, idx) => {
        const isSelected = selected === tile.value
        return (
          <Button
            key={tile.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            variant="outline"
            tabIndex={isSelected ? 0 : -1}
            onClick={() => handleSelect(tile.value)}
            onKeyDown={(e) => handleKey(e, idx)}
            data-testid={`emotion-tile-${tile.value}`}
            data-selected={isSelected ? 'true' : 'false'}
            className={cn(
              'flex aspect-square h-auto flex-col items-center justify-center gap-2 rounded-2xl p-3',
              isSelected ? 'ring-2 ring-accent' : null,
            )}
          >
            <MoodShape shape={tile.shape} />
            <span className="text-xs font-medium">{tile.label}</span>
          </Button>
        )
      })}
    </div>
  )

  if (layout === 'overlay') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center"
        data-testid="emotion-picker-overlay"
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close emotion picker"
          onClick={onDismiss}
          data-testid="emotion-picker-backdrop"
          className="absolute inset-0 cursor-default bg-foreground/30"
        />
        <div className="relative w-full max-w-xs rounded-2xl border border-border bg-background p-4 shadow-2xl">
          {grid}
        </div>
      </div>
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
