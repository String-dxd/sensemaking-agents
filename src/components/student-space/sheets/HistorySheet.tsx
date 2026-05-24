import { useLocation, useNavigate, useParams } from '@tanstack/react-router'
import { Check, ChevronDown, RefreshCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PageSurface,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetIdentityHeader,
  SheetNavButton,
  SheetSidebar,
  SheetSidenav,
  SheetTitle,
  usePageEscape,
} from '~/components/ui/sheet'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { cn } from '~/lib/utils'
import { CalendarPane } from './CalendarPane'
import { DayDetailCard } from './DayDetailCard'
import { GrowthIslandPreview } from './GrowthIslandPreview'

/**
 * History sheet — combined Timeline + Growth surface (U6 React rewrite of
 * `src/engine/student-space/Game/View/HistorySheet.js`).
 *
 * Tabs:
 *  - Timeline: inline calendar grid + selected-day detail card (post-PR-33
 *    layout — no day-detail overlay; both panes share the right pane)
 *  - Growth: year scrubber + stat tiles + Three.js island preview
 *
 * The Growth tab's preview is a contained Three.js view that shares the
 * engine's `view.scene` (so `view.sprouts.setTimelapseSubset(trees)` already
 * drives which bloomed trees are visible per year). The preview's renderer
 * + camera + OrbitControls live inside a useEffect in <GrowthIslandPreview>.
 */
type HistoryTab = 'timeline' | 'growth'

export function HistorySheet() {
  const engine = useEngine()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams({ strict: false }) as { tab?: string }
  const initialTab: HistoryTab = params.tab === 'growth' ? 'growth' : 'timeline'

  const [activeTab, setActiveTab] = useState<HistoryTab>(initialTab)

  // Keep React state in sync with URL changes (browser back/forward).
  useEffect(() => {
    if (params.tab === 'growth' && activeTab !== 'growth') setActiveTab('growth')
    if (params.tab !== 'growth' && activeTab !== 'timeline') setActiveTab('timeline')
  }, [params.tab, activeTab])

  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  // Engine state for Timeline tab (moodPins + captures + calendar events).
  type Subscribable = { subscribe: (cb: () => void) => () => void }
  type EngineState = {
    moodPins?: Subscribable & { pins?: Array<{ entryDate: string; emotion?: string }> }
    captures?: Subscribable & {
      entries?: Array<{
        id: string
        entryDate: string
        kind: string
        text?: string
        createdAt?: string
        backendMirrorEntryId?: number | string
        reviewStatus?: string
      }>
      findById?: (id: string) => unknown
      patch?: (id: string, updates: Record<string, unknown>) => unknown
    }
    calendar?: Subscribable & {
      events?: Array<{
        entryDate?: string
        date?: string
        kind?: string
        title?: string
        label?: string
      }>
    }
    sprouts?: { years?: () => number[] }
    backend?: unknown
    applyBackendSnapshot?: (snapshot: unknown) => void
  }
  const state = (engine as unknown as { state?: EngineState } | null)?.state
  useEngineSliceVersion(state?.moodPins ?? null)
  useEngineSliceVersion(state?.captures ?? null)
  useEngineSliceVersion(state?.calendar ?? null)

  const setTab = useCallback(
    (tab: HistoryTab) => {
      setActiveTab(tab)
      if (tab === 'growth') {
        navigate({ to: '/history/$tab', params: { tab: 'growth' } })
        return
      }
      navigate({ to: '/history' })
    },
    [navigate],
  )

  const dismissToHome = useCallback(() => navigate({ to: '/' }), [navigate])
  usePageEscape(dismissToHome)

  return (
    <PageSurface>
      <SheetSidebar data-stagger-slot="1">
        <SheetIdentityHeader>
          <SheetTitle>History</SheetTitle>
          <SheetDescription>Your moments, moods, and reflections over time.</SheetDescription>
        </SheetIdentityHeader>
        <SheetSidenav>
          <SheetNavButton active={activeTab === 'timeline'} onClick={() => setTab('timeline')}>
            Timeline
          </SheetNavButton>
          <SheetNavButton active={activeTab === 'growth'} onClick={() => setTab('growth')}>
            Growth
          </SheetNavButton>
        </SheetSidenav>
      </SheetSidebar>
      <SheetContent>
        <SheetBody data-stagger-slot="2">
          <div key={activeTab} data-tab-content>
            {activeTab === 'timeline' ? (
              <TimelinePane
                engineState={state}
                hash={location.hash ?? ''}
                filter={
                  (location.search as { filter?: unknown } | undefined)?.filter === 'need-review'
                    ? 'need-review'
                    : undefined
                }
              />
            ) : (
              <GrowthPane engine={engine} />
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </PageSurface>
  )
}

function TimelinePane({
  engineState,
  hash,
  filter,
}: {
  engineState: Parameters<typeof CalendarPane>[0]['engineState']
  hash: string
  filter?: 'need-review'
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const lastAppliedHashRef = useRef('')
  const lastAppliedFilterTargetRef = useRef<string | null>(null)
  const targetDate = resolveTargetDate({
    captures: engineState?.captures?.entries ?? [],
    hash,
    filter,
  })

  useEffect(() => {
    if (hash && targetDate && lastAppliedHashRef.current !== hash) {
      setSelectedDate(targetDate)
      lastAppliedHashRef.current = hash
      return
    }
    if (!hash) lastAppliedHashRef.current = ''

    if (
      !hash &&
      filter === 'need-review' &&
      targetDate &&
      lastAppliedFilterTargetRef.current !== targetDate
    ) {
      setSelectedDate(targetDate)
      lastAppliedFilterTargetRef.current = targetDate
      return
    }
    if (filter !== 'need-review') lastAppliedFilterTargetRef.current = null

    if (selectedDate) return
    const now = new Date()
    setSelectedDate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    )
  }, [filter, hash, selectedDate, targetDate])

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  return (
    <div className="space-y-6">
      <PaneHeader
        tag="Timeline"
        titleNode={
          <>
            Your <ViewModeDropdown value={viewMode} onChange={setViewMode} />
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <CalendarPane
          engineState={engineState}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
        <DayDetailCard date={selectedDate} engineState={engineState as never} />
      </div>
    </div>
  )
}

function ViewModeDropdown({
  value,
  onChange,
}: {
  value: 'week' | 'month'
  onChange: (next: 'week' | 'month') => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const options = [
    { id: 'week' as const, label: 'week' },
    { id: 'month' as const, label: 'month' },
  ]

  return (
    <span ref={rootRef} className="relative inline-block align-baseline">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-1.5 -mx-1.5 text-(--color-sheet-ink) hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {options.find((o) => o.id === value)?.label}
        <ChevronDown aria-hidden className="size-5 text-(--color-sheet-ink-soft)" />
      </button>
      {open ? (
        <span
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-10 inline-block min-w-32 rounded-xl border border-(--color-sheet-divider) bg-white p-1 text-base font-medium text-(--color-sheet-ink) shadow-[0_18px_48px_rgba(43,38,32,0.14)]"
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.id}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm capitalize transition-colors hover:bg-black/5',
                value === option.id && 'font-semibold',
              )}
            >
              {option.label}
              {value === option.id ? (
                <Check aria-hidden className="size-3.5 text-(--color-status-searching)" />
              ) : null}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}

function PaneHeader({
  tag,
  title,
  titleNode,
  subtitle,
  actions,
}: {
  tag: string
  title?: string
  titleNode?: React.ReactNode
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="w-fit rounded-full bg-(--color-onb-bg-cream) px-2.5 py-1 text-xs font-semibold text-(--color-sheet-ink)">
        {tag}
      </span>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold leading-tight text-(--color-sheet-ink)">
            {titleNode ?? title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-base leading-relaxed text-(--color-sheet-ink-soft)">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  )
}

function resolveTargetDate({
  captures,
  hash,
  filter,
}: {
  captures: Array<{
    id?: string
    entryDate: string
    createdAt?: string
    backendMirrorEntryId?: number | string
    reviewStatus?: string
  }>
  hash: string
  filter?: 'need-review'
}) {
  const entryId = entryIdFromHash(hash)
  if (entryId) {
    const target = captures.find(
      (capture) =>
        Number(capture.backendMirrorEntryId) === entryId || capture.id === `mirror:${entryId}`,
    )
    if (target?.entryDate) return target.entryDate
  }
  if (filter === 'need-review') {
    return (
      captures
        .filter((capture) => capture.reviewStatus === 'pending' && capture.entryDate)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]?.entryDate ?? null
    )
  }
  return null
}

function entryIdFromHash(hash: string) {
  const cleaned = hash.startsWith('#') ? hash : `#${hash}`
  const match = cleaned.match(/^#(?:reflection|entry)-(\d+)$/)
  if (!match?.[1]) return null
  const id = Number.parseInt(match[1], 10)
  return Number.isFinite(id) ? id : null
}

function GrowthPane({ engine }: { engine: unknown }) {
  type EngineYears = { state?: { sprouts?: { years?: () => number[] } } }
  const yearsFn = (engine as EngineYears | null)?.state?.sprouts?.years
  const now = new Date()
  const year = useMemo<number>(() => {
    const fromEngine = yearsFn?.() ?? []
    return fromEngine[0] ?? now.getFullYear()
  }, [yearsFn, now])

  const currentTerm = currentTermFor(now)
  const isCurrentYear = year === now.getFullYear()
  const [selectedTerm, setSelectedTerm] = useState<number>(isCurrentYear ? currentTerm : 4)

  return (
    <div className="space-y-6">
      <PaneHeader
        tag="Growth"
        title="The shape of your reflections over time"
        subtitle="Term by term, how your island has grown."
      />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="School terms">
        {[1, 2, 3, 4].map((term) => {
          const isFuture = isCurrentYear && term > currentTerm
          const isSelected = term === selectedTerm
          return (
            <button
              key={term}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-disabled={isFuture || undefined}
              disabled={isFuture}
              onClick={() => setSelectedTerm(term)}
              data-active={isSelected || undefined}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors',
                isSelected
                  ? 'cursor-pointer border-(--color-sheet-ink) bg-(--color-sheet-ink) text-white'
                  : 'border-(--color-sheet-divider) text-(--color-sheet-ink) hover:bg-black/5',
                !isSelected && 'cursor-pointer',
                isFuture && 'cursor-not-allowed opacity-40 hover:bg-transparent',
              )}
            >
              Term {term} · {year}
            </button>
          )
        })}
      </div>
      <GrowthYearSummary year={year} term={selectedTerm} />
      <GrowthIslandPreview year={year} engine={engine} />
    </div>
  )
}

function currentTermFor(date: Date): number {
  // Singapore academic terms (calendar year):
  // T1 Jan–Mar, T2 Apr–Jun, T3 Jul–Aug, T4 Sep–Nov.
  const month = date.getMonth()
  return month <= 2 ? 1 : month <= 5 ? 2 : month <= 7 ? 3 : 4
}

function termLabelForYear(year: number, now: Date): string {
  const currentYear = now.getFullYear()
  if (year < currentYear) return `Term 4 · ${year}`
  if (year > currentYear) return `Term 1 · ${year}`
  return `Term ${currentTermFor(now)} · ${year}`
}

interface GrowthSummary {
  year: number
  reflections?: number
  crystallised?: number
  forgotten?: number
  dominant?: string
  narrative?: string
}

function GrowthYearSummary({ year, term }: { year: number; term?: number }) {
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    void attempt // Retry signal: bumping `attempt` re-runs this effect.
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch(`/api/growth/summary?year=${year}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('fetch failed'))))
      .then((data) => {
        if (cancelled) return
        setSummary(data as GrowthSummary)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year, attempt])

  const termLabel = term ? `Term ${term} · ${year}` : termLabelForYear(year, new Date())
  if (loading) {
    return <p className="text-sm text-(--color-sheet-ink-soft)">Loading {termLabel}…</p>
  }
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) px-4 py-3">
        <p className="text-sm text-(--color-sheet-ink-soft)">
          Couldn't load the {termLabel} summary.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-(--color-sheet-divider) bg-white/80 px-3 text-xs font-semibold text-(--color-sheet-ink) hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-status-searching)"
        >
          <RefreshCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    )
  }
  if (!summary) {
    return (
      <p className="text-sm text-(--color-sheet-ink-soft)">
        No reflections in {termLabel} yet — captures from the island will show up as they bloom.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {summary.narrative ? (
        <p className="text-base leading-relaxed text-(--color-sheet-ink)">{summary.narrative}</p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={summary.reflections} label="Voice reflections" />
        <StatTile value={summary.crystallised} label="Claims crystallised" />
        <StatTile value={summary.forgotten} label="Claims let go" />
        <StatTile value={summary.dominant ?? '—'} label="Dominant dimension" />
      </dl>
    </div>
  )
}

function StatTile({ value, label }: { value: string | number | undefined; label: string }) {
  return (
    <div className="rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-3">
      <p
        data-testid="stat-tile-value"
        className="text-lg font-semibold tabular-nums text-(--color-sheet-ink)"
      >
        {value ?? '—'}
      </p>
      <p className="text-xs text-(--color-sheet-ink-soft)">{label}</p>
    </div>
  )
}
