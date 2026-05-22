import { useNavigate, useParams } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetIdentityHeader,
  SheetPageHeader,
  SheetSidebar,
  SheetSurface,
  SheetTitle,
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
      }>
    }
    calendar?: Subscribable & {
      events?: Array<{ entryDate: string; kind?: string; title?: string }>
    }
    sprouts?: { years?: () => number[] }
  }
  const state = (engine as unknown as { state?: EngineState } | null)?.state
  useEngineSliceVersion(state?.moodPins ?? null)
  useEngineSliceVersion(state?.captures ?? null)
  useEngineSliceVersion(state?.calendar ?? null)

  const setTab = useCallback(
    (tab: HistoryTab) => {
      setActiveTab(tab)
      navigate({ to: tab === 'growth' ? '/history/growth' : '/history' })
    },
    [navigate],
  )

  return (
    <Sheet
      open
      modal={false}
      onOpenChange={(next) => {
        if (next === false) navigate({ to: '/' })
      }}
    >
      <SheetSurface>
        <SheetSidebar>
          <SheetIdentityHeader>
            <SheetTitle>History</SheetTitle>
            <SheetDescription>
              The trail of moments, moods, and bloomed claims behind you.
            </SheetDescription>
          </SheetIdentityHeader>
          <nav className="px-4 pb-6">
            <TabButton active={activeTab === 'timeline'} onClick={() => setTab('timeline')}>
              Timeline
            </TabButton>
            <TabButton active={activeTab === 'growth'} onClick={() => setTab('growth')}>
              Growth
            </TabButton>
          </nav>
        </SheetSidebar>
        <SheetContent>
          <SheetPageHeader>
            <SheetTitle>{activeTab === 'timeline' ? 'Timeline' : 'Growth'}</SheetTitle>
          </SheetPageHeader>
          <SheetBody>
            {activeTab === 'timeline' ? (
              <TimelinePane engineState={state} />
            ) : (
              <GrowthPane engine={engine} />
            )}
          </SheetBody>
        </SheetContent>
      </SheetSurface>
    </Sheet>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active || undefined}
      className={cn(
        'flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
        active
          ? 'bg-(--color-sheet-pane-left) text-(--color-sheet-ink)'
          : 'text-(--color-sheet-ink-soft) hover:bg-black/5',
      )}
    >
      {children}
    </button>
  )
}

function TimelinePane({
  engineState,
}: {
  engineState: Parameters<typeof CalendarPane>[0]['engineState']
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Default to today on first render.
  useEffect(() => {
    if (selectedDate) return
    const now = new Date()
    setSelectedDate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    )
  }, [selectedDate])

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <CalendarPane
        engineState={engineState}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
      <DayDetailCard date={selectedDate} engineState={engineState as never} />
    </div>
  )
}

function GrowthPane({ engine }: { engine: unknown }) {
  type EngineYears = { state?: { sprouts?: { years?: () => number[] } } }
  const yearsFn = (engine as EngineYears | null)?.state?.sprouts?.years
  const years = useMemo<number[]>(() => {
    const fromEngine = yearsFn?.() ?? []
    if (fromEngine.length > 0) return [...fromEngine].sort((a, b) => b - a)
    const current = new Date().getFullYear()
    return [current, current - 1, current - 2]
  }, [yearsFn])

  const [selectedYear, setSelectedYear] = useState<number>(years[0] ?? new Date().getFullYear())

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Years">
        {years.map((year) => (
          <button
            key={year}
            type="button"
            role="tab"
            aria-selected={year === selectedYear}
            onClick={() => setSelectedYear(year)}
            data-active={year === selectedYear || undefined}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors',
              year === selectedYear
                ? 'border-(--color-status-searching) bg-(--color-status-searching) text-white'
                : 'border-(--color-sheet-divider) text-(--color-sheet-ink) hover:bg-black/5',
            )}
          >
            {year}
          </button>
        ))}
      </div>
      <GrowthYearSummary year={selectedYear} />
      <GrowthIslandPreview year={selectedYear} engine={engine} />
    </div>
  )
}

interface GrowthSummary {
  year: number
  reflections?: number
  crystallised?: number
  forgotten?: number
  dominant?: string
  narrative?: string
}

function GrowthYearSummary({ year }: { year: number }) {
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
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
  }, [year])

  if (loading) {
    return <p className="text-sm text-(--color-sheet-ink-soft)">Loading {year}…</p>
  }
  if (error || !summary) {
    return <p className="text-sm text-(--color-sheet-ink-soft)">Could not load this year yet.</p>
  }

  return (
    <div className="space-y-4">
      {summary.narrative ? (
        <p className="text-sm leading-relaxed text-(--color-sheet-ink)">{summary.narrative}</p>
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
