import { Button as BaseButton } from '@base-ui-components/react/button'
import { Toggle } from '@base-ui-components/react/toggle'
import { ToggleGroup } from '@base-ui-components/react/toggle-group'
import { CalendarDays, Camera, ChevronLeft, ChevronRight, NotebookPen, Smile } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EMOTION_BY_ID, shapeDataUri } from '~/lib/student-space/mood-shapes'
import { cn } from '~/lib/utils'

/**
 * CalendarPane — React rewrite of the engine CalendarSheet's month grid.
 * Renders a 6×7 cell grid for the visible month with mood dots (small
 * colored dots) and capture markers (square = ask, filled = photo) layered
 * on each day cell. Clicking a day calls `onSelectDate(ymd)`.
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

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayLabel = (d: Date): string =>
  d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

function buildMonthCells(year: number, month0: number): Date[] {
  const first = new Date(year, month0, 1)
  const startOffset = first.getDay()
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month0, 1 + (i - startOffset)))
  return cells
}

function buildWeekCells(anchor: Date): Date[] {
  const sunday = new Date(anchor)
  sunday.setDate(anchor.getDate() - anchor.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    cells.push(d)
  }
  return cells
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

function formatWeekRange(cells: Date[]): string {
  const start = cells[0]
  const end = cells[cells.length - 1]
  if (!start || !end) return ''
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const sameYear = start.getFullYear() === end.getFullYear()
  if (sameMonth) {
    return `${SHORT_MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`
  }
  if (sameYear) {
    return `${SHORT_MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${SHORT_MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${start.getFullYear()}`
  }
  return `${SHORT_MONTH_NAMES[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()} – ${SHORT_MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
}

export interface CalendarPaneEngineState {
  moodPins?: { pins?: Array<{ entryDate: string; emotion?: string }> }
  captures?: { entries?: Array<{ entryDate: string; kind: string }> }
  calendar?: { events?: Array<{ entryDate?: string; date?: string; kind?: string }> }
}

export type CalendarViewMode = 'week' | 'month'

export function CalendarPane({
  engineState,
  selectedDate,
  onSelectDate,
  viewMode = 'week',
  onViewModeChange,
}: {
  engineState: CalendarPaneEngineState | undefined
  selectedDate: string | null
  onSelectDate: (date: string) => void
  viewMode?: CalendarViewMode
  onViewModeChange?: (mode: CalendarViewMode) => void
}) {
  void onViewModeChange // Receiver wires the toggle; CalendarPane only reads viewMode now.
  const now = new Date()
  const [anchorDate, setAnchorDate] = useState<Date>(() => parseYmdToDate(selectedDate) ?? now)

  useEffect(() => {
    const next = parseYmdToDate(selectedDate)
    if (next) setAnchorDate(next)
  }, [selectedDate])

  const cells = useMemo(
    () =>
      viewMode === 'week'
        ? buildWeekCells(anchorDate)
        : buildMonthCells(anchorDate.getFullYear(), anchorDate.getMonth()),
    [viewMode, anchorDate],
  )
  const moods = engineState?.moodPins?.pins ?? []
  const captures = engineState?.captures?.entries ?? []
  const events = engineState?.calendar?.events ?? []

  const moodsByDay = new Map<string, Array<{ emotion?: string }>>()
  for (const pin of moods) {
    const list = moodsByDay.get(pin.entryDate) ?? []
    list.push(pin)
    moodsByDay.set(pin.entryDate, list)
  }

  const capturesByDay = new Map<string, Array<{ kind: string }>>()
  for (const cap of captures) {
    const list = capturesByDay.get(cap.entryDate) ?? []
    list.push(cap)
    capturesByDay.set(cap.entryDate, list)
  }

  const eventsByDay = new Map<string, number>()
  for (const ev of events) {
    const date = eventDate(ev)
    if (date) eventsByDay.set(date, (eventsByDay.get(date) ?? 0) + 1)
  }

  const todayYmd = ymd(now)
  const viewYear = anchorDate.getFullYear()
  const viewMonth = anchorDate.getMonth()

  const stepView = (delta: number) => {
    const next = new Date(anchorDate)
    if (viewMode === 'week') next.setDate(next.getDate() + delta * 7)
    else next.setMonth(next.getMonth() + delta)
    setAnchorDate(next)
  }

  const headerLabel =
    viewMode === 'week' ? formatWeekRange(cells) : `${MONTH_NAMES[viewMonth]} ${viewYear}`

  const isCurrentView =
    viewMode === 'week'
      ? cells.some((c) => ymd(c) === todayYmd)
      : viewYear === now.getFullYear() && viewMonth === now.getMonth()

  return (
    <div
      data-testid="calendar-pane"
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
              onClick={() => setAnchorDate(now)}
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
          {cells.map((cell) => {
            const cellYmd = ymd(cell)
            const isOutside = viewMode === 'month' && cell.getMonth() !== viewMonth
            const isSelected = selectedDate === cellYmd
            const isToday = cellYmd === todayYmd
            const cellMoods = moodsByDay.get(cellYmd) ?? []
            const cellCaps = capturesByDay.get(cellYmd) ?? []
            const cellEvents = eventsByDay.get(cellYmd) ?? 0

            return (
              <Toggle
                key={cellYmd}
                type="button"
                value={cellYmd}
                aria-current={isToday ? 'date' : undefined}
                aria-label={dayLabel(cell)}
                data-selected={isSelected || undefined}
                data-today={isToday || undefined}
                data-outside={isOutside || undefined}
                className={cn(
                  'group relative flex cursor-pointer flex-col rounded-lg border border-transparent p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  viewMode === 'week' ? 'min-h-14' : 'aspect-square min-h-10',
                  isOutside && !isSelected && 'opacity-35',
                  isToday && !isSelected && 'border-[rgba(43,38,32,0.24)] bg-white/45',
                  isSelected
                    ? 'border-(--color-status-searching) bg-(--color-status-searching) text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
                    : 'text-(--color-sheet-ink) hover:bg-black/5',
                )}
              >
                <span className="text-xs font-medium tabular-nums">{cell.getDate()}</span>
                <div className="mt-auto flex min-h-2 flex-wrap items-center gap-0.5">
                  {cellMoods.slice(0, 3).map((mood, i) => {
                    const emotion = EMOTION_BY_ID[mood.emotion ?? '']
                    if (!emotion) return null
                    return (
                      <img
                        // biome-ignore lint/suspicious/noArrayIndexKey: mood badges are positional within a day
                        key={i}
                        src={shapeDataUri(emotion)}
                        alt=""
                        aria-hidden
                        className="size-3.5"
                        draggable={false}
                      />
                    )
                  })}
                  {cellCaps.length > 0
                    ? (() => {
                        const hasPhoto = cellCaps.some((c) => c.kind === 'photo')
                        const Icon = hasPhoto ? Camera : NotebookPen
                        return (
                          <Icon
                            aria-hidden
                            className={cn(
                              'size-3',
                              isSelected ? 'text-white' : 'text-(--color-sheet-ink)',
                            )}
                          />
                        )
                      })()
                    : null}
                  {cellEvents > 0 ? (
                    <CalendarDays
                      aria-hidden
                      className={cn(
                        'size-3',
                        isSelected ? 'text-white' : 'text-(--color-sheet-ink)',
                      )}
                    />
                  ) : null}
                </div>
              </Toggle>
            )
          })}
        </ToggleGroup>
      </fieldset>
      <CalendarLegend />
    </div>
  )
}

function CalendarLegend() {
  return (
    <ul
      aria-label="Calendar marker legend"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-(--color-sheet-divider)/70 pt-3 text-xs text-(--color-sheet-ink-soft)"
    >
      <li className="inline-flex items-center gap-1.5">
        <Smile aria-hidden className="size-3.5 text-(--color-sheet-ink)" />
        Mood
      </li>
      <li className="inline-flex items-center gap-1.5">
        <NotebookPen aria-hidden className="size-3.5 text-(--color-sheet-ink)" />
        Reflection
      </li>
      <li className="inline-flex items-center gap-1.5">
        <Camera aria-hidden className="size-3.5 text-(--color-sheet-ink)" />
        Photo
      </li>
      <li className="inline-flex items-center gap-1.5">
        <CalendarDays aria-hidden className="size-3.5 text-(--color-sheet-ink)" />
        Event
      </li>
    </ul>
  )
}

function eventDate(event: { entryDate?: string; date?: string }) {
  return event.entryDate || event.date || ''
}

function parseYmdToDate(value: string | null): Date | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number.parseInt(match[1] ?? '', 10)
  const month = Number.parseInt(match[2] ?? '', 10) - 1
  const day = Number.parseInt(match[3] ?? '', 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return new Date(year, month, day)
}
