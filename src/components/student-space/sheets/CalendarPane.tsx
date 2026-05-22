import { useMemo, useState } from 'react'
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
  calendar?: { events?: Array<{ entryDate: string; kind?: string }> }
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
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth])
  const moods = engineState?.moodPins?.pins ?? []
  const captures = engineState?.captures?.entries ?? []
  const events = engineState?.calendar?.events ?? []

  const moodsByDay = useMemo(() => {
    const map = new Map<string, Array<{ emotion?: string }>>()
    for (const pin of moods) {
      const list = map.get(pin.entryDate) ?? []
      list.push(pin)
      map.set(pin.entryDate, list)
    }
    return map
  }, [moods])

  const capturesByDay = useMemo(() => {
    const map = new Map<string, Array<{ kind: string }>>()
    for (const cap of captures) {
      const list = map.get(cap.entryDate) ?? []
      list.push(cap)
      map.set(cap.entryDate, list)
    }
    return map
  }, [captures])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const ev of events) map.set(ev.entryDate, (map.get(ev.entryDate) ?? 0) + 1)
    return map
  }, [events])

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
      className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4"
    >
      <header className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          aria-label="Previous month"
          className="inline-flex size-8 items-center justify-center rounded-full hover:bg-black/5"
        >
          ‹
        </button>
        <h3 className="text-sm font-semibold text-(--color-sheet-ink) tabular-nums">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <div className="flex items-center gap-1">
          {!isCurrentMonth ? (
            <button
              type="button"
              onClick={() => {
                setViewYear(now.getFullYear())
                setViewMonth(now.getMonth())
              }}
              className="rounded-full px-3 py-1 text-xs font-medium text-(--color-sheet-ink-soft) hover:bg-black/5"
            >
              Today
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => stepMonth(1)}
            aria-label="Next month"
            className="inline-flex size-8 items-center justify-center rounded-full hover:bg-black/5"
          >
            ›
          </button>
        </div>
      </header>
      <div className="mb-1.5 grid grid-cols-7 text-center text-[11px] font-semibold text-(--color-sheet-ink-soft)">
        {DAY_LABELS.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: weekday labels are positional
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const cellYmd = ymd(cell)
          const isOutside = cell.getMonth() !== viewMonth
          const isSelected = selectedDate === cellYmd
          const isToday = cellYmd === todayYmd
          const cellMoods = moodsByDay.get(cellYmd) ?? []
          const cellCaps = capturesByDay.get(cellYmd) ?? []
          const cellEvents = eventsByDay.get(cellYmd) ?? 0

          return (
            <button
              key={cellYmd}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              data-selected={isSelected || undefined}
              data-today={isToday || undefined}
              data-outside={isOutside || undefined}
              onClick={() => onSelectDate(cellYmd)}
              className={cn(
                'group relative flex aspect-square min-h-[44px] flex-col rounded-lg border border-transparent p-1.5 text-left transition-colors',
                isOutside && 'opacity-40',
                isToday && 'border-(--color-facet-personality-accent)',
                isSelected
                  ? 'bg-(--color-status-searching) text-white'
                  : 'hover:bg-black/5 text-(--color-sheet-ink)',
              )}
            >
              <span className="text-xs font-medium tabular-nums">{cell.getDate()}</span>
              <div className="mt-auto flex flex-wrap gap-0.5">
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
                      cellCaps.some((c) => c.kind === 'photo')
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
            </button>
          )
        })}
      </div>
    </div>
  )
}
