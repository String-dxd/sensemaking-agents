import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { type DebugAgentStatus, finishAgentRun, startAgentRun } from '~/agents/run-status'
import { MirrorEvalReviewBadge, parseMirrorEvalReview } from '~/components/MirrorEvalReview'
import { MirrorReflectionSections } from '~/components/MirrorReflectionSections'
import { Button } from '~/components/ui/button'
import type { MirrorEntryRow } from '~/db/queries'
import { cn } from '~/lib/utils'
import { loadWiki } from '~/server/load-wiki.functions'
import { runConnector } from '~/server/run-connector.functions'
import { bulkUpdateMirrorReview, updateMirrorReview } from '~/server/update-mirror-review.functions'

export type ReflectionsFilter = 'all' | 'need-review'

export interface ReflectionsSheetViewProps {
  studentId: string
  filter: ReflectionsFilter
  onFilterChange: (filter: ReflectionsFilter) => void
}

export function ReflectionsSheetView({
  studentId,
  filter,
  onFilterChange,
}: ReflectionsSheetViewProps) {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ['wiki', studentId],
    queryFn: () => loadWiki({ data: {} }),
  })

  const connector = useMutation({
    mutationFn: async () => {
      startAgentRun('connector', 'Linking confirmed reflections into the profile pages.')
      try {
        const result = await runConnector({ data: {} })
        finishAgentRun(
          'connector',
          connectorDebugStatus(result.status),
          connectorStatusCopy(result.status, result.processed, result.remaining),
        )
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connector failed.'
        finishAgentRun('connector', 'failed', message)
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vips-pages', studentId] })
      qc.invalidateQueries({ queryKey: ['wiki', studentId] })
      qc.invalidateQueries({ queryKey: ['trajectory', studentId] })
    },
  })
  const entries = data?.entries ?? []
  const pendingReviewCount = entries.filter((entry) => entry.review_status === 'pending').length

  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-t-[1.75rem] bg-gradient-to-b from-[#fdfaf3] to-[#efe7d5] text-[#2b2620]"
      data-testid="reflections-sheet"
    >
      <header className="mx-auto grid w-full max-w-[900px] gap-4 border-b border-[#e3d8c4] px-6 pb-5 pt-12 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
            Library
          </p>
          <h2 className="text-[clamp(1.6rem,4vw,2rem)] font-semibold leading-tight tracking-tight">
            Reflection calendar
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-[#2b2620]/60">
            Confirm what still fits. Connector turns confirmed thoughts into the profile pages.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={connector.isPending}
          onClick={() => connector.mutate()}
          data-testid="sheet-run-connector"
          className="rounded-full border-[#a07659]/45 bg-white/55 text-[#5b3519] hover:bg-white/80"
        >
          {connector.isPending ? 'connecting…' : 'Run Connector'}
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-[900px] flex-wrap items-center justify-between gap-3 px-6 pt-5">
        <ReflectionsFilterBar
          filter={filter}
          pendingReviewCount={pendingReviewCount}
          onChange={onFilterChange}
        />
        {connector.isSuccess ? (
          <p className="text-xs text-[#2b2620]/55" data-testid="sheet-run-connector-status">
            {connectorStatusCopy(
              connector.data.status,
              connector.data.processed,
              connector.data.remaining,
            )}
          </p>
        ) : null}
        {connector.isError ? (
          <p className="text-xs text-warning" role="alert">
            {connector.error instanceof Error ? connector.error.message : 'Connector failed'}
          </p>
        ) : null}
      </div>

      {isPending ? (
        <p className="mx-auto w-full max-w-[900px] px-6 pt-4 text-sm text-[#2b2620]/55">
          loading thoughts…
        </p>
      ) : null}
      {data ? (
        <ReflectionsCalendar entries={entries} filter={filter} studentId={studentId} />
      ) : null}
    </section>
  )
}

function ReflectionsCalendar({
  entries,
  filter,
  studentId,
}: {
  entries: MirrorEntryRow[]
  filter: ReflectionsFilter
  studentId: string
}) {
  const qc = useQueryClient()
  const pendingEntries = useMemo(
    () => entries.filter((entry) => entry.review_status === 'pending'),
    [entries],
  )
  const visibleEntries = useMemo(
    () => (filter === 'need-review' ? pendingEntries : entries),
    [entries, filter, pendingEntries],
  )
  const latestDateKey = useMemo(() => getLatestEntryDateKey(visibleEntries), [visibleEntries])
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(latestDateKey ?? todayKey()))
  const [selectedDate, setSelectedDate] = useState(() => latestDateKey ?? todayKey())
  const entriesByDate = useMemo(() => groupEntriesByDate(visibleEntries), [visibleEntries])
  const selectedEntries = entriesByDate.get(selectedDate) ?? []
  const monthCells = useMemo(() => buildMonthCells(viewMonth), [viewMonth])

  useEffect(() => {
    if (!latestDateKey) return
    setViewMonth(startOfMonth(latestDateKey))
    setSelectedDate((current) => (entriesByDate.has(current) ? current : latestDateKey))
  }, [latestDateKey, entriesByDate])

  const invalidateReflectionDependents = () => {
    qc.invalidateQueries({ queryKey: ['wiki', studentId] })
    qc.invalidateQueries({ queryKey: ['vips-pages', studentId] })
    qc.invalidateQueries({ queryKey: ['trajectory', studentId] })
  }

  const updateOne = useMutation({
    mutationFn: (input: { entryId: number; status: 'confirmed' | 'forgotten' }) =>
      updateMirrorReview({ data: input }),
    onSuccess: invalidateReflectionDependents,
  })

  const updateAll = useMutation({
    mutationFn: (status: 'confirmed' | 'forgotten') => bulkUpdateMirrorReview({ data: { status } }),
    onSuccess: invalidateReflectionDependents,
  })

  if (visibleEntries.length === 0 && filter === 'all') {
    return (
      <div className="mx-auto w-full max-w-[900px] px-6 py-8 text-sm text-[#2b2620]/55">
        No thoughts recorded yet.
      </div>
    )
  }

  if (visibleEntries.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-6 py-8 text-sm text-[#2b2620]/55">
        No recorded thoughts are waiting for confirm or forget.
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-[900px] gap-5 px-6 pb-14 pt-5 lg:grid-cols-[minmax(0,560px)_minmax(280px,1fr)]">
      <div className="min-w-0">
        <CalendarHeader
          viewMonth={viewMonth}
          onShift={(delta) => setViewMonth(shiftMonth(viewMonth, delta))}
          onToday={() => {
            const next = startOfMonth(todayKey())
            setViewMonth(next)
            setSelectedDate(todayKey())
          }}
        />
        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-[#2b2620]/45">
          {DAY_LABELS.map((day) => (
            <span key={day.key}>{day.label}</span>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5" data-testid="sheet-reflections-calendar">
          {monthCells.map((cell) => {
            const dateKey = toDateKey(cell)
            const dayEntries = entriesByDate.get(dateKey) ?? []
            const isSelected = selectedDate === dateKey
            const isToday = dateKey === todayKey()
            const inMonth = cell.getMonth() === viewMonth.getMonth()
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                data-testid={`calendar-day-${dateKey}`}
                className={cn(
                  'flex aspect-square min-h-14 flex-col justify-between rounded-[10px] bg-white/55 p-1.5 text-left text-xs font-medium transition-colors',
                  'hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  !inMonth && 'opacity-35',
                  isToday && 'outline outline-1 outline-offset-[-1px] outline-[#8e6fb8]',
                  isSelected && 'bg-white shadow-[inset_0_0_0_1.5px_#a07659]',
                )}
                aria-pressed={isSelected}
              >
                <span className="text-right font-mono text-[11px] text-[#2b2620]/70">
                  {cell.getDate()}
                </span>
                <CalendarDayMarks entries={dayEntries} />
              </button>
            )
          })}
        </div>
      </div>

      <aside
        className="min-h-[22rem] rounded-[18px] bg-white/45 p-4 shadow-[inset_0_0_0_1px_rgba(160,118,89,0.16)]"
        data-testid="calendar-day-detail"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/50">Day</p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight">
          {formatLongDate(selectedDate)}
        </h3>
        <p className="mt-1 text-xs text-[#2b2620]/55">
          {selectedEntries.length === 0
            ? 'Nothing logged this day.'
            : `${selectedEntries.length} ${selectedEntries.length === 1 ? 'reflection' : 'reflections'}`}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {selectedEntries.map((entry) => (
            <ReflectionCard
              key={entry.id}
              entry={entry}
              disabled={updateOne.isPending || updateAll.isPending}
              onConfirm={() => updateOne.mutate({ entryId: entry.id, status: 'confirmed' })}
              onForget={() => updateOne.mutate({ entryId: entry.id, status: 'forgotten' })}
            />
          ))}
        </div>
      </aside>

      {pendingEntries.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#e3d8c4] pt-4 lg:col-span-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
            {pendingEntries.length} waiting
          </span>
          <Button
            type="button"
            size="sm"
            variant="accent"
            disabled={updateAll.isPending}
            onClick={() => updateAll.mutate('confirmed')}
            data-testid="sheet-confirm-all-mirrors"
          >
            Confirm all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updateAll.isPending}
            onClick={() => updateAll.mutate('forgotten')}
            data-testid="sheet-forget-all-mirrors"
          >
            Forget all
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ReflectionsFilterBar({
  filter,
  pendingReviewCount,
  onChange,
}: {
  filter: ReflectionsFilter
  pendingReviewCount: number
  onChange: (filter: ReflectionsFilter) => void
}) {
  return (
    <div
      className="flex w-fit flex-wrap items-center gap-1 rounded-full bg-white/55 p-1"
      data-testid="sheet-reflections-filter-bar"
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          'rounded-full text-[#2b2620]/60 hover:text-[#2b2620]',
          filter === 'all' && 'bg-[#2b2620] text-[#fdfaf3] hover:bg-[#2b2620]',
        )}
        onClick={() => onChange('all')}
        data-testid="sheet-reflections-filter-all"
      >
        All recorded
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          'rounded-full text-[#2b2620]/60 hover:text-[#2b2620]',
          filter === 'need-review' && 'bg-[#2b2620] text-[#fdfaf3] hover:bg-[#2b2620]',
        )}
        onClick={() => onChange('need-review')}
        data-testid="sheet-reflections-filter-need-review"
      >
        Need review{pendingReviewCount > 0 ? ` (${pendingReviewCount})` : ''}
      </Button>
    </div>
  )
}

function ReflectionCard({
  entry,
  disabled,
  onConfirm,
  onForget,
}: {
  entry: MirrorEntryRow
  disabled: boolean
  onConfirm: () => void
  onForget: () => void
}) {
  const evalReview = parseMirrorEvalReview(entry.raw_output_json)
  return (
    <li
      id={`reflection-${entry.id}`}
      className="list-none rounded-[14px] bg-white/60 p-3 text-sm"
      data-testid={`sheet-mirror-entry-${entry.id}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Reflection #{entry.id}</h3>
            <p className="mt-1 text-xs text-[#2b2620]/55">
              {new Date(entry.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f1ede5] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#2b2620]/60">
              {entry.review_status === 'pending' ? 'needs review' : entry.review_status}
            </span>
            <MirrorEvalReviewBadge review={evalReview} />
          </div>
        </div>

        <MirrorReflectionSections entry={entry} />

        <details className="text-xs">
          <summary className="cursor-pointer font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
            Transcript
          </summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-[#2b2620]/60">
            {entry.transcript}
          </p>
        </details>
        {entry.review_status === 'pending' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={disabled}
              onClick={onConfirm}
            >
              Confirm
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={onForget}
            >
              Forget
            </Button>
          </div>
        ) : null}
        <Link
          to="/library/entries/$entryId"
          params={{ entryId: String(entry.id) }}
          className="w-fit text-xs font-medium text-[#6a4a26] hover:underline"
        >
          open detail →
        </Link>
      </div>
    </li>
  )
}

function CalendarHeader({
  viewMonth,
  onShift,
  onToday,
}: {
  viewMonth: Date
  onShift: (delta: number) => void
  onToday: () => void
}) {
  const currentMonthKey = monthKey(new Date())
  const showingCurrentMonth = monthKey(viewMonth) === currentMonthKey

  return (
    <div className="flex items-center gap-2" data-testid="calendar-month-header">
      <button
        type="button"
        onClick={() => onShift(-1)}
        aria-label="Previous month"
        className="inline-flex size-9 items-center justify-center rounded-full border border-[#2b2620]/10 bg-white/55 text-[#2b2620] transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronLeft aria-hidden className="size-4" />
      </button>
      <h3 className="min-w-0 flex-1 text-center text-base font-semibold">
        {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </h3>
      <button
        type="button"
        onClick={() => onShift(1)}
        aria-label="Next month"
        className="inline-flex size-9 items-center justify-center rounded-full border border-[#2b2620]/10 bg-white/55 text-[#2b2620] transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronRight aria-hidden className="size-4" />
      </button>
      {showingCurrentMonth ? null : (
        <button
          type="button"
          onClick={onToday}
          className="rounded-full bg-[#e8ddf2] px-3 py-2 text-xs font-semibold text-[#4c3470] transition-colors hover:bg-[#ded0ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Today
        </button>
      )}
    </div>
  )
}

function CalendarDayMarks({ entries }: { entries: MirrorEntryRow[] }) {
  const visible = entries.slice(0, 3)
  const hidden = entries.length - visible.length

  if (entries.length === 0) {
    return <span aria-hidden className="min-h-4" />
  }

  return (
    <span className="flex min-h-4 flex-wrap items-center gap-1">
      {visible.map((entry) => (
        <span
          key={entry.id}
          aria-label={entry.review_status}
          role="img"
          title={entry.review_status}
          className={cn(
            'size-3.5 rounded-[4px] shadow-[0_1px_2px_rgba(0,0,0,0.08)]',
            entry.review_status === 'pending'
              ? 'bg-[#f1a04e]'
              : entry.review_status === 'confirmed'
                ? 'bg-[#82b16a]'
                : 'bg-[#a8a5bd]',
          )}
        />
      ))}
      {hidden > 0 ? (
        <span className="rounded-full bg-[#2b2620]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2b2620]/70">
          +{hidden}
        </span>
      ) : null}
    </span>
  )
}

const DAY_LABELS = [
  { key: 'sun', label: 'S' },
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
]

function groupEntriesByDate(entries: MirrorEntryRow[]): Map<string, MirrorEntryRow[]> {
  const grouped = new Map<string, MirrorEntryRow[]>()
  for (const entry of entries) {
    const key = toDateKey(entry.created_at)
    const group = grouped.get(key) ?? []
    group.push(entry)
    grouped.set(key, group)
  }
  for (const group of grouped.values()) {
    group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
  return grouped
}

function getLatestEntryDateKey(entries: MirrorEntryRow[]): string | null {
  const latest = entries
    .map((entry) => new Date(entry.created_at))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0]
  return latest ? toDateKey(latest) : null
}

function buildMonthCells(viewMonth: Date): Date[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const startOffset = first.getDay()
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
    day.setDate(1 + index - startOffset)
    return day
  })
}

function shiftMonth(viewMonth: Date, delta: number): Date {
  return new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1)
}

function startOfMonth(dateKey: string): Date {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return new Date()
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function toDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return todayKey()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function todayKey(): string {
  return toDateKey(new Date())
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatLongDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function connectorStatusCopy(status: string, processed: number, remaining: number): string {
  switch (status) {
    case 'ok':
      return `Connector linked ${processed} ${processed === 1 ? 'reflection' : 'reflections'}.`
    case 'nothing_to_run':
      return 'Connector found no confirmed reflections ready to link.'
    case 'partial':
      return `Connector linked what it could; ${remaining} still waiting.`
    case 'timeout':
      return 'Connector timed out before linking a reflection.'
    case 'schema_reject':
      return 'Connector returned an invalid diff.'
    case 'transport_error':
      return 'Connector transport failed.'
    case 'auth_error':
      return 'Connector auth failed.'
    default:
      return 'Connector stopped before finishing.'
  }
}

function connectorDebugStatus(status: string): Exclude<DebugAgentStatus, 'idle' | 'running'> {
  switch (status) {
    case 'ok':
    case 'partial':
      return 'succeeded'
    case 'nothing_to_run':
      return 'skipped'
    default:
      return 'failed'
  }
}
