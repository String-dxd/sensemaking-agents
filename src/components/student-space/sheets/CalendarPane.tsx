import { Button as BaseButton } from '@base-ui-components/react/button'
import { Toggle } from '@base-ui-components/react/toggle'
import { ToggleGroup } from '@base-ui-components/react/toggle-group'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
const MOOD_HEX: Record<string, string> = {
  joy: '#FFD66B',
  sadness: '#7FB3D9',
  anger: '#E36A55',
  fear: '#B49AD6',
  disgust: '#9CC36E',
  anxiety: '#F1A04E',
  envy: '#6FC2B3',
  embarrassment: '#F0A6B5',
  ennui: '#A8A5BD',
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
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

export interface CalendarPaneEngineState {
  moodPins?: { pins?: Array<{ entryDate: string; emotion?: string }> }
  captures?: { entries?: Array<{ entryDate: string; kind: string }> }
  calendar?: { events?: Array<{ entryDate?: string; date?: string; kind?: string }> }
}

export function CalendarPane({
  engineState,
  selectedDate,
  onSelectDate,
}: {
  engineState: CalendarPaneEngineState | undefined
  selectedDate: string | null
  onSelectDate: (date: string) => void
}) {
  const now = new Date()
  const selectedDateParts = parseYmd(selectedDate)
  const selectedYear = selectedDateParts?.year
  const selectedMonth = selectedDateParts?.month
  const [viewYear, setViewYear] = useState(selectedYear ?? now.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedMonth ?? now.getMonth())

  useEffect(() => {
    if (selectedYear == null || selectedMonth == null) return
    setViewYear(selectedYear)
    setViewMonth(selectedMonth)
  }, [selectedYear, selectedMonth])

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth])
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

  const stepMonth = (delta: number) => {
    const m = viewMonth + delta
    if (m < 0) {
      setViewYear(viewYear - 1)
      setViewMonth(11)
    } else if (m > 11) {
      setViewYear(viewYear + 1)
      setViewMonth(0)
    } else {
      setViewMonth(m)
    }
  }

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth()

  return (
    <div
      data-testid="calendar-pane"
      className="w-full max-w-[420px] self-start rounded-xl bg-(--color-sheet-pane-left) p-4 shadow-[inset_0_0_0_1px_var(--color-sheet-divider),0_1px_1px_rgba(43,38,32,0.04)]"
    >
      <header className="mb-3 flex items-center justify-between">
        <BaseButton
          type="button"
          onClick={() => stepMonth(-1)}
          aria-label="Previous month"
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-(--color-sheet-ink-soft) transition-colors hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </BaseButton>
        <h3 className="text-sm font-semibold text-(--color-sheet-ink) tabular-nums">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <div className="flex items-center gap-1">
          {!isCurrentMonth ? (
            <BaseButton
              type="button"
              onClick={() => {
                setViewYear(now.getFullYear())
                setViewMonth(now.getMonth())
              }}
              className="h-8 cursor-pointer rounded-full px-3 text-xs font-semibold text-(--color-sheet-ink-soft) transition-colors hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Today
            </BaseButton>
          ) : null}
          <BaseButton
            type="button"
            onClick={() => stepMonth(1)}
            aria-label="Next month"
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-(--color-sheet-ink-soft) transition-colors hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight aria-hidden className="size-4" />
          </BaseButton>
        </div>
      </header>
      <div className="mb-1.5 grid grid-cols-7 text-center text-[11px] font-semibold text-(--color-sheet-ink-soft)">
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
            const isOutside = cell.getMonth() !== viewMonth
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
                  'group relative flex aspect-square min-h-10 cursor-pointer flex-col rounded-lg border border-transparent p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isOutside && !isSelected && 'opacity-35',
                  isToday && !isSelected && 'border-[rgba(43,38,32,0.24)] bg-white/45',
                  isSelected
                    ? 'border-(--color-status-searching) bg-(--color-status-searching) text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
                    : 'text-(--color-sheet-ink) hover:bg-black/5',
                )}
              >
                <span className="text-xs font-medium tabular-nums">{cell.getDate()}</span>
                <div className="mt-auto flex min-h-2 flex-wrap gap-0.5">
                  {cellMoods.slice(0, 3).map((mood, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: mood badges are positional within a day
                      key={i}
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ background: MOOD_HEX[mood.emotion ?? ''] ?? '#bbb' }}
                    />
                  ))}
                  {cellCaps.length > 0 ? (
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 rounded-sm',
                        isSelected
                          ? 'bg-white'
                          : cellCaps.some((c) => c.kind === 'photo')
                            ? 'bg-(--color-sheet-ink)'
                            : 'border border-(--color-sheet-ink)',
                      )}
                    />
                  ) : null}
                  {cellEvents > 0 ? (
                    <span aria-hidden className="text-[10px] leading-none">
                      ·
                    </span>
                  ) : null}
                </div>
              </Toggle>
            )
          })}
        </ToggleGroup>
      </fieldset>
    </div>
  )
}

function eventDate(event: { entryDate?: string; date?: string }) {
  return event.entryDate || event.date || ''
}

function parseYmd(value: string | null): { year: number; month: number } | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-\d{2}$/)
  if (!match) return null
  const year = Number.parseInt(match[1] ?? '', 10)
  const month = Number.parseInt(match[2] ?? '', 10) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  return { year, month }
}
