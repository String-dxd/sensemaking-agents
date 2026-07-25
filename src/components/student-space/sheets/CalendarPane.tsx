import { Button as BaseButton } from '@base-ui-components/react/button'
import { Toggle } from '@base-ui-components/react/toggle'
import { ToggleGroup } from '@base-ui-components/react/toggle-group'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { addSgDays, sgDayKeyParts, sgMonthGridKeys, sgToday, sgWeekKeys } from '~/lib/entry-date'
import { EMOTION_BY_ID } from '~/lib/student-space/mood-shapes'
import { cn } from '~/lib/utils'

/**
 * CalendarPane — React rewrite of the engine CalendarSheet's month grid.
 * Renders a 6×7 cell grid for the visible month. Each day stacks event
 * chips: reflections show their title on a "paper" chip with a mood-coloured
 * spine, teacher events show a quieter borderless chip, and overflow past
 * `MAX_CHIPS` collapses to "+N more". Clicking a day calls `onSelectDate(ymd)`.
 *
 * Keyboard focus stays on the clicked cell — selection swaps `data-selected`
 * Tailwind variant only, not a full re-render of the calendar (PR #33
 * invariant).
 */
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * Format a day key for the accessible name. The key is anchored to UTC and
 * read back with `timeZone: 'UTC'`, so the label can never disagree with the
 * key it came from — rebuilding a local `Date` from a key would re-introduce
 * the device timezone and shift the label a day east of UTC+8.
 */
const dayLabel = (dayKey: string): string => {
  const parts = sgDayKeyParts(dayKey)
  if (!parts) return dayKey
  return new Date(Date.UTC(parts.year, parts.month0, parts.day)).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatWeekRange(cells: string[]): string {
  const start = sgDayKeyParts(cells[0])
  const end = sgDayKeyParts(cells[cells.length - 1])
  if (!start || !end) return ''
  const sameMonth = start.month0 === end.month0 && start.year === end.year
  const sameYear = start.year === end.year
  if (sameMonth) {
    return `${SHORT_MONTH_NAMES[start.month0]} ${start.day} – ${end.day}, ${start.year}`
  }
  if (sameYear) {
    return `${SHORT_MONTH_NAMES[start.month0]} ${start.day} – ${SHORT_MONTH_NAMES[end.month0]} ${end.day}, ${start.year}`
  }
  return `${SHORT_MONTH_NAMES[start.month0]} ${start.day}, ${start.year} – ${SHORT_MONTH_NAMES[end.month0]} ${end.day}, ${end.year}`
}

export interface CalendarPaneEngineState {
  moodPins?: { pins?: Array<{ entryDate: string; emotion?: string }> }
  captures?: {
    entries?: Array<{
      entryDate: string
      kind: string
      title?: string
      contextType?: string
      reframe?: { headline?: string; moods?: string[] }
    }>
  }
  calendar?: {
    events?: Array<{
      entryDate?: string
      date?: string
      kind?: string
      label?: string
      title?: string
    }>
  }
}

/** A reflection or teacher event rendered as an in-cell chip. */
interface DayChipItem {
  type: 'reflection' | 'event'
  label: string
  /** Mood accent (spine) colour for reflections. */
  accent?: string
}

/** How many chips fit before collapsing to "+N more", by view. */
const MAX_CHIPS = { week: 4, month: 3 } as const

export type CalendarViewMode = 'week' | 'month'

export function CalendarPane({
  engineState,
  selectedDate,
  onSelectDate,
  viewMode = 'week',
  onViewModeChange,
  loading = false,
}: {
  engineState: CalendarPaneEngineState | undefined
  selectedDate: string | null
  onSelectDate: (date: string) => void
  viewMode?: CalendarViewMode
  onViewModeChange?: (mode: CalendarViewMode) => void
  /**
   * Cold-load only: the backend snapshot hasn't settled yet and there is no
   * cached data, so real chips can't be drawn. Renders placeholder chip bars
   * (matching the real chip geometry, so there's no layout shift when data
   * lands) instead of a bare empty grid that reads as "nothing here".
   */
  loading?: boolean
}) {
  void onViewModeChange // Receiver wires the toggle; CalendarPane only reads viewMode now.
  // Cell identity is a YYYY-MM-DD Asia/Singapore day key end to end: no cell is
  // ever built from `new Date(y, m, d)`, so the rendered day number, the
  // accessible label and the Toggle value can never disagree with each other or
  // with the key the read side files entries under.
  const [anchorKey, setAnchorKey] = useState<string>(() =>
    selectedDate && sgDayKeyParts(selectedDate) ? selectedDate : sgToday(),
  )

  useEffect(() => {
    if (selectedDate && sgDayKeyParts(selectedDate)) setAnchorKey(selectedDate)
  }, [selectedDate])

  const todayYmd = sgToday()
  const anchorParts = sgDayKeyParts(anchorKey) ?? sgDayKeyParts(todayYmd)
  const viewYear = anchorParts?.year ?? 1970
  const viewMonth = anchorParts?.month0 ?? 0

  const cells = useMemo(
    () => (viewMode === 'week' ? sgWeekKeys(anchorKey) : sgMonthGridKeys(viewYear, viewMonth)),
    [viewMode, anchorKey, viewYear, viewMonth],
  )
  const captures = engineState?.captures?.entries ?? []
  const events = engineState?.calendar?.events ?? []

  // One chip list per day: reflections first (they are the content), teacher
  // events after (they are context). Reflections carry a mood-coloured spine.
  const chipsByDay = new Map<string, DayChipItem[]>()
  const pushChip = (date: string, chip: DayChipItem) => {
    const list = chipsByDay.get(date) ?? []
    list.push(chip)
    chipsByDay.set(date, list)
  }
  for (const cap of captures) {
    const mood = cap.reframe?.moods?.[0]
    pushChip(cap.entryDate, {
      type: 'reflection',
      label: cap.title?.trim() || cap.reframe?.headline?.trim() || 'Reflection',
      accent: mood ? EMOTION_BY_ID[mood]?.color : undefined,
    })
  }
  for (const ev of events) {
    const date = eventDate(ev)
    if (!date) continue
    pushChip(date, { type: 'event', label: ev.label ?? ev.title ?? 'Event' })
  }

  const stepView = (delta: number) => {
    if (viewMode === 'week') {
      setAnchorKey((current) => addSgDays(current, delta * 7) ?? current)
      return
    }
    // Month steps anchor to the 1st. Stepping with a local Date's setMonth used
    // to overflow from long months (Jan 31 + 1 month → Mar 3); month view only
    // reads year/month off the anchor, so the day is not otherwise observable.
    const stepped = new Date(Date.UTC(viewYear, viewMonth + delta, 1))
    const y = stepped.getUTCFullYear()
    const mm = String(stepped.getUTCMonth() + 1).padStart(2, '0')
    setAnchorKey(`${y}-${mm}-01`)
  }

  const headerLabel =
    viewMode === 'week' ? formatWeekRange(cells) : `${MONTH_NAMES[viewMonth]} ${viewYear}`

  const todayParts = sgDayKeyParts(todayYmd)
  const isCurrentView =
    viewMode === 'week'
      ? cells.includes(todayYmd)
      : viewYear === todayParts?.year && viewMonth === todayParts?.month0

  return (
    <div
      data-testid="calendar-pane"
      aria-busy={loading || undefined}
      className="w-full self-start rounded-xl bg-(--color-sheet-pane-left) p-4 shadow-[inset_0_0_0_1px_var(--color-sheet-divider),0_1px_1px_rgba(43,38,32,0.04)]"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <BaseButton
          type="button"
          onClick={() => stepView(-1)}
          aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-(--color-sheet-ink-soft) transition-[background-color,color,transform] hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </BaseButton>
        <h3 className="flex-1 truncate text-center text-sm font-semibold text-(--color-sheet-ink) tabular-nums">
          {headerLabel}
        </h3>
        <div className="flex items-center gap-1">
          {!isCurrentView ? (
            <BaseButton
              type="button"
              onClick={() => setAnchorKey(todayYmd)}
              className="h-10 cursor-pointer rounded-full px-3 text-xs font-semibold text-(--color-sheet-ink-soft) transition-[background-color,color,transform] hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
            >
              Today
            </BaseButton>
          ) : null}
          <BaseButton
            type="button"
            onClick={() => stepView(1)}
            aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-(--color-sheet-ink-soft) transition-[background-color,color,transform] hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
          >
            <ChevronRight aria-hidden className="size-4" />
          </BaseButton>
        </div>
      </header>
      <div className="mb-1.5 grid grid-cols-7 text-center text-xs font-semibold text-(--color-sheet-ink-soft)">
        {DAY_LABELS.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: weekday labels are positional
          <div key={i}>{d}</div>
        ))}
      </div>
      <fieldset>
        <legend className="sr-only">History calendar</legend>
        <ToggleGroup
          aria-label="History calendar dates"
          className="grid grid-cols-7 gap-1"
          loopFocus
          multiple={false}
          value={selectedDate ? [selectedDate] : []}
          onValueChange={(next) => {
            const value = next.at(-1)
            if (typeof value === 'string') onSelectDate(value)
          }}
        >
          {cells.map((cellYmd) => {
            const cellParts = sgDayKeyParts(cellYmd)
            const isOutside = viewMode === 'month' && cellParts?.month0 !== viewMonth
            const isSelected = selectedDate === cellYmd
            const isToday = cellYmd === todayYmd
            const cellChips = chipsByDay.get(cellYmd) ?? []
            const maxChips = MAX_CHIPS[viewMode]
            const visibleChips =
              cellChips.length > maxChips ? cellChips.slice(0, maxChips - 1) : cellChips
            const hiddenCount = cellChips.length - visibleChips.length

            return (
              <Toggle
                key={cellYmd}
                type="button"
                value={cellYmd}
                aria-current={isToday ? 'date' : undefined}
                aria-label={dayLabel(cellYmd)}
                data-selected={isSelected || undefined}
                data-today={isToday || undefined}
                data-outside={isOutside || undefined}
                className={cn(
                  'group relative flex cursor-pointer flex-col gap-1 overflow-hidden rounded-lg border border-transparent p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  viewMode === 'week' ? 'min-h-28' : 'min-h-24',
                  isOutside && !isSelected && 'opacity-35',
                  isToday && !isSelected && 'border-[rgba(43,38,32,0.24)] bg-white/45',
                  isSelected
                    ? 'border-(--color-status-searching) bg-(--color-status-searching) text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
                    : 'text-(--color-sheet-ink) hover:bg-black/5',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 px-0.5 text-xs font-semibold tabular-nums',
                    isSelected ? 'text-white' : 'text-(--color-sheet-ink)',
                  )}
                >
                  {cellParts?.day}
                </span>
                {loading && !isOutside ? (
                  <div className="flex min-h-0 flex-col gap-0.5" aria-hidden>
                    {Array.from({ length: skeletonChipCount(cellParts?.day ?? 1) }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: positional skeleton bars
                      <SkeletonChip key={i} />
                    ))}
                  </div>
                ) : visibleChips.length > 0 ? (
                  <div className="flex min-h-0 flex-col gap-0.5">
                    {visibleChips.map((chip, i) => (
                      <DayChip
                        // biome-ignore lint/suspicious/noArrayIndexKey: chips are positional within a day
                        key={i}
                        chip={chip}
                        selected={isSelected}
                      />
                    ))}
                    {hiddenCount > 0 ? (
                      <span
                        className={cn(
                          'px-1 text-[10px] font-medium leading-tight',
                          isSelected ? 'text-white/80' : 'text-(--color-sheet-ink-soft)',
                        )}
                      >
                        +{hiddenCount} more
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </Toggle>
            )
          })}
        </ToggleGroup>
      </fieldset>
      <CalendarLegend />
    </div>
  )
}

/**
 * A single in-cell chip. Reflections are filled "paper" chips with a
 * mood-coloured spine and the entry title; teacher events are quieter,
 * borderless chips with a hollow marker so content outranks context.
 */
function DayChip({ chip, selected }: { chip: DayChipItem; selected: boolean }) {
  if (chip.type === 'event') {
    return (
      <span
        className={cn(
          'flex items-center gap-1 overflow-hidden py-px pr-1 pl-1 text-[10px] leading-tight',
          selected ? 'text-white/85' : 'text-(--color-sheet-ink-soft)',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full border',
            selected ? 'border-white/70' : 'border-(--color-sheet-ink-soft)',
          )}
        />
        <span className="truncate">{chip.label}</span>
      </span>
    )
  }
  const spine = chip.accent ?? (selected ? 'rgba(255,255,255,0.7)' : 'var(--color-sheet-ink-soft)')
  return (
    <span
      className={cn(
        'flex items-center gap-1 overflow-hidden rounded-[5px] py-[3px] pr-1.5 pl-1 text-[10px] font-medium leading-tight',
        selected
          ? 'bg-white/20 text-white'
          : 'bg-white/65 text-(--color-sheet-ink) shadow-[inset_0_0_0_1px_rgba(43,38,32,0.06)]',
      )}
    >
      <span
        aria-hidden
        className="h-2.5 w-[3px] shrink-0 rounded-full"
        style={{ background: spine }}
      />
      <span className="truncate">{chip.label}</span>
    </span>
  )
}

/**
 * A pulsing placeholder shaped like a reflection chip (spine + title bar), so
 * cold-load cells look "about to have content" and real chips drop in without
 * shifting layout. Purely decorative — the cell carries `aria-hidden` on the
 * wrapper and the calendar sets `aria-busy` while loading.
 */
function SkeletonChip() {
  return (
    <span className="flex items-center gap-1 overflow-hidden rounded-[5px] bg-black/[0.05] py-[3px] pr-1.5 pl-1">
      <span className="h-2.5 w-[3px] shrink-0 rounded-full bg-black/10" />
      <span className="h-1.5 flex-1 rounded-full bg-black/10 motion-safe:animate-pulse" />
    </span>
  )
}

/**
 * Deterministic 0–2 skeleton bars per day so the loading grid reads like a
 * real month (some days busy, some empty) rather than a uniform block. Keyed
 * on day-of-month so it's stable across re-renders within a load.
 */
function skeletonChipCount(day: number): number {
  return [1, 0, 2, 1, 0, 1, 2][day % 7] ?? 0
}

function CalendarLegend() {
  return (
    <ul
      aria-label="Calendar marker legend"
      className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-(--color-sheet-divider)/70 pt-3 text-xs text-(--color-sheet-ink-soft)"
    >
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-[3px] shrink-0 rounded-full bg-(--color-sheet-ink)" />
        Reflection — colour shows the mood
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full border border-(--color-sheet-ink-soft)"
        />
        Event
      </li>
    </ul>
  )
}

function eventDate(event: { entryDate?: string; date?: string }) {
  return event.entryDate || event.date || ''
}
