import { useNavigate } from '@tanstack/react-router'
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
import {
  actionsForCluster,
  DIFFUSED_NUDGES,
  FORECLOSED_CHALLENGE_PROMPT,
  STARTER_PROMPT,
  statusCopyOf,
  statusLabelOf,
} from '~/engine/student-space/Game/View/statusHeuristics.js'
// @ts-expect-error untyped engine module
import { trajectoryFor } from '~/engine/student-space/Game/View/trajectoryHeuristics.js'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { cn } from '~/lib/utils'

/**
 * Path Finder — full-viewport sheet at `/trajectory`. U5 React rewrite of
 * `src/engine/student-space/Game/View/TrajectorySheet.js` (874 lines).
 *
 * The sheet branches by inferred Marcia identity status
 * (Starter / Diffused / Searching / Foreclosed / Achieved). The status is
 * computed at open time by the existing engine heuristic modules
 * (trajectoryHeuristics, statusHeuristics) — those modules are pure JS and
 * are imported directly here. The React component owns the rendering, action
 * wiring, and slice subscriptions.
 *
 * "Show me all paths" escape hatch is local React state. The status preview
 * override (DevPalette) writes to `state.identityStatusOverride`; the React
 * component subscribes via useEngineSliceVersion and re-renders the new
 * audit's status branch when the override flips.
 */
type StatusKey = 'starter' | 'diffused' | 'searching' | 'foreclosed' | 'achieved'

interface TrajectoryAudit {
  status: StatusKey
  reason: string
  isOverride: boolean
}

interface Bearing {
  title?: string
  prompt?: string
  clusterId?: string
  msfUrl?: string
}

interface TrajectoryCapture {
  createdAt: string
  trajectory?: {
    throughLine?: string
    bearings?: Bearing[]
  }
}

export function TrajectorySheet() {
  const engine = useEngine()
  const navigate = useNavigate()

  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  // Engine state — slices are untyped on the contract; cast to read.
  type Subscribable = { subscribe: (cb: () => void) => () => void }
  type EngineState = {
    captures?: Subscribable & {
      entries?: () => Array<TrajectoryCapture & { kind?: string }>
    }
    profile?: Subscribable & {
      displayCompanionName?: () => string
      identity?: unknown
    }
    choices?: Subscribable | null
    backend?: { runTrajectory?: () => Promise<unknown> } | null
    backendActive?: boolean
    identityStatusOverride?: Subscribable | null
  }
  const state = (engine as unknown as { state?: EngineState } | null)?.state
  useEngineSliceVersion(state?.identityStatusOverride ?? null)
  useEngineSliceVersion(state?.profile ?? null)
  useEngineSliceVersion(state?.captures ?? null)
  useEngineSliceVersion(state?.choices ?? null)

  const [escapeHatch, setEscapeHatch] = useState(false)
  const [running, setRunning] = useState(false)

  const audit = useMemo<TrajectoryAudit | null>(() => {
    if (!state) return null
    const result = trajectoryFor({
      profile: state.profile,
      captures: state.captures,
      choices: state.choices,
      override: state.identityStatusOverride,
    }) as TrajectoryAudit | undefined
    return result ?? { status: 'searching', reason: '', isOverride: false }
  }, [state])

  const capture = useMemo<TrajectoryCapture | null>(() => {
    const entries = state?.captures?.entries?.() ?? []
    for (let i = entries.length - 1; i >= 0; i--) {
      const c = entries[i]
      if (c?.kind === 'trajectory' && c.trajectory) return c
    }
    return null
  }, [state])

  if (!audit) {
    return (
      <Sheet open modal={false} onOpenChange={(next) => next === false && navigate({ to: '/' })}>
        <SheetSurface>
          <SheetContent>
            <SheetBody>
              <p className="text-sm text-(--color-sheet-ink-soft)">Loading Path Finder…</p>
            </SheetBody>
          </SheetContent>
        </SheetSurface>
      </Sheet>
    )
  }

  const renderStatus: StatusKey = escapeHatch ? 'searching' : audit.status
  const identity = (state?.profile as { identity?: unknown } | undefined)?.identity ?? null
  const copy = (statusCopyOf(renderStatus, identity as never) ?? {}) as {
    title?: string
    tldr?: string
    lead?: string
  }
  const companion = state?.profile?.displayCompanionName?.() || 'Kira'

  const openAsk = useCallback(
    (prompt: string) => {
      type OverlayCtl = { open: (name: string, opts: unknown) => void }
      const overlay = (engine as unknown as { view?: { overlayController?: OverlayCtl } } | null)
        ?.view?.overlayController
      overlay?.open('ask', { prompt, dismissOnBack: true })
    },
    [engine],
  )

  const runBackend = useCallback(async () => {
    if (!state?.backend?.runTrajectory) return
    setRunning(true)
    try {
      await state.backend.runTrajectory()
    } finally {
      setRunning(false)
    }
  }, [state])

  const needsBearings = renderStatus !== 'starter' && renderStatus !== 'diffused'
  const showRun = state?.backend?.runTrajectory && needsBearings
  const showEscape = audit.status !== 'starter' && audit.status !== 'searching' && !escapeHatch

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
            <SheetTitle>Path Finder</SheetTitle>
            <SheetDescription>
              Bearings drawn from the patterns in your reflections.
            </SheetDescription>
          </SheetIdentityHeader>
          <div className="space-y-3 px-7 pb-6">
            <StatusPill status={audit.status} isPreview={audit.isOverride} />
            {copy.title ? (
              <p className="text-base font-semibold text-(--color-sheet-ink)">{copy.title}</p>
            ) : null}
            {copy.tldr ? (
              <p className="text-sm leading-relaxed text-(--color-sheet-ink-soft)">{copy.tldr}</p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              {showRun ? (
                <button
                  type="button"
                  onClick={runBackend}
                  disabled={running}
                  data-testid="trajectory-run"
                  className="inline-flex items-center rounded-full bg-(--color-status-searching) px-4 py-1.5 text-sm font-semibold text-white transition-opacity active:scale-[0.96] disabled:opacity-60"
                >
                  {running ? 'Running…' : 'Run sense-making'}
                </button>
              ) : null}
              {showEscape ? (
                <button
                  type="button"
                  onClick={() => setEscapeHatch(true)}
                  data-testid="trajectory-escape"
                  className="inline-flex items-center rounded-full border border-(--color-sheet-divider) px-4 py-1.5 text-sm font-medium text-(--color-sheet-ink) hover:bg-black/5 active:scale-[0.96]"
                >
                  Show me all paths
                </button>
              ) : null}
              {escapeHatch ? (
                <button
                  type="button"
                  onClick={() => setEscapeHatch(false)}
                  data-testid="trajectory-back"
                  className="inline-flex items-center rounded-full border border-(--color-sheet-divider) px-4 py-1.5 text-sm font-medium text-(--color-sheet-ink) hover:bg-black/5 active:scale-[0.96]"
                >
                  Back to {statusLabelOf(audit.status)}
                </button>
              ) : null}
            </div>
          </div>
        </SheetSidebar>
        <SheetContent>
          <SheetPageHeader>
            <SheetTitle>Path Finder</SheetTitle>
          </SheetPageHeader>
          <SheetBody>
            <StatusBody
              status={renderStatus}
              capture={capture}
              companion={companion}
              backendActive={state?.backendActive}
              hasBackend={Boolean(state?.backend?.runTrajectory)}
              onAsk={openAsk}
            />
          </SheetBody>
        </SheetContent>
      </SheetSurface>
    </Sheet>
  )
}

function StatusPill({ status, isPreview }: { status: StatusKey; isPreview: boolean }) {
  const color: Record<StatusKey, string> = {
    starter: 'bg-(--color-status-starter)',
    diffused: 'bg-(--color-status-diffused)',
    searching: 'bg-(--color-status-searching)',
    foreclosed: 'bg-(--color-status-foreclosed)',
    achieved: 'bg-(--color-status-achieved)',
  }
  return (
    <span
      data-status={status}
      data-testid="trajectory-status-pill"
      className="inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-(--color-sheet-ink)"
    >
      <span aria-hidden className={cn('size-2 rounded-full', color[status])} />
      {isPreview ? 'Preview · ' : ''}
      {statusLabelOf(status)}
    </span>
  )
}

function StatusBody({
  status,
  capture,
  companion,
  backendActive,
  hasBackend,
  onAsk,
}: {
  status: StatusKey
  capture: TrajectoryCapture | null
  companion: string
  backendActive?: boolean
  hasBackend: boolean
  onAsk: (prompt: string) => void
}) {
  if (status === 'starter') {
    const title = (STARTER_PROMPT.title as string).replace('{companionName}', companion)
    return (
      <div className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-6">
        <p className="text-sm font-medium text-(--color-sheet-ink)">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-(--color-sheet-ink-soft)">
          {STARTER_PROMPT.prompt}
        </p>
        <button
          type="button"
          onClick={() => onAsk(STARTER_PROMPT.prompt as string)}
          data-testid="trajectory-starter-cta"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-(--color-onb-accent) px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.96]"
        >
          Start a chat with {companion} <span aria-hidden>→</span>
        </button>
      </div>
    )
  }

  if (status === 'diffused') {
    const nudges = DIFFUSED_NUDGES as unknown as Array<{ title: string; prompt: string }>
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
          Pick a nudge
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {nudges.map((nudge) => (
            <li key={nudge.prompt}>
              <button
                type="button"
                onClick={() => onAsk(nudge.prompt)}
                className="w-full rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4 text-left text-sm hover:bg-black/5 active:scale-[0.98] transition-transform"
              >
                <p className="font-medium text-(--color-sheet-ink)">{nudge.title}</p>
                <p className="mt-1 text-(--color-sheet-ink-soft)">{nudge.prompt}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (!capture?.trajectory) {
    return (
      <div className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-6">
        <p className="font-medium text-(--color-sheet-ink)">
          {backendActive
            ? 'No backend trajectory has been generated yet.'
            : 'No trajectory has been generated yet.'}
        </p>
        <p className="mt-2 text-sm text-(--color-sheet-ink-soft)">
          {hasBackend
            ? 'Run sense-making to generate a Cartographer trajectory.'
            : 'Open Path Finder after more profile evidence is available.'}
        </p>
      </div>
    )
  }

  const bearings = capture.trajectory.bearings ?? []

  if (status === 'foreclosed') {
    return (
      <div className="space-y-6">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
            Worth holding up next to yours
          </p>
          <ol className="mt-3 space-y-3">
            {bearings.slice(0, 2).map((b, i) => (
              <li
                key={b.title ?? i}
                className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-sm font-semibold text-(--color-sheet-ink-soft)">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-(--color-sheet-ink)">{b.title}</h3>
                    <p className="mt-1 text-sm text-(--color-sheet-ink-soft)">{b.prompt}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5">
          <p className="text-sm font-medium text-(--color-sheet-ink)">
            {FORECLOSED_CHALLENGE_PROMPT.title}
          </p>
          <button
            type="button"
            onClick={() => onAsk(FORECLOSED_CHALLENGE_PROMPT.prompt as string)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-(--color-onb-accent) px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.96]"
          >
            Open the question with {companion} →
          </button>
        </section>
      </div>
    )
  }

  if (status === 'achieved') {
    return (
      <ol className="space-y-4">
        {bearings.map((b, i) => {
          const actions = (actionsForCluster(b.clusterId) ?? []) as string[]
          return (
            <li
              key={b.title ?? i}
              className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5"
            >
              <header className="flex items-start gap-3">
                <span className="text-sm font-semibold text-(--color-sheet-ink-soft)">{i + 1}</span>
                <h3 className="text-base font-semibold text-(--color-sheet-ink)">{b.title}</h3>
              </header>
              <p className="mt-2 text-sm text-(--color-sheet-ink-soft)">{b.prompt}</p>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
                Next concrete steps
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-(--color-sheet-ink)">
                {actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ol>
              {b.msfUrl ? (
                <a
                  href={b.msfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-(--color-status-searching) hover:underline"
                >
                  Explore on MySkillsFuture ↗
                </a>
              ) : null}
            </li>
          )
        })}
      </ol>
    )
  }

  // searching (also catches escape-hatch)
  return <SearchingBody capture={capture} />
}

function SearchingBody({ capture }: { capture: TrajectoryCapture }) {
  const bearings = capture.trajectory?.bearings ?? []
  const [activeIndex, setActiveIndex] = useState(0)
  const active = bearings[activeIndex]
  const throughLine = (capture.trajectory?.throughLine ?? '').trim()

  return (
    <div className="space-y-5">
      {throughLine ? (
        <p className="text-sm leading-relaxed text-(--color-sheet-ink-soft)">{throughLine}</p>
      ) : null}
      <nav className="flex flex-wrap gap-2" role="tablist">
        {bearings.map((b, i) => (
          <button
            key={b.title ?? i}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            onClick={() => setActiveIndex(i)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              i === activeIndex
                ? 'border-(--color-status-searching) bg-(--color-status-searching) text-white'
                : 'border-(--color-sheet-divider) text-(--color-sheet-ink) hover:bg-black/5',
            )}
          >
            <span className="text-xs font-semibold">{i + 1}</span>
            <span>{b.title}</span>
          </button>
        ))}
      </nav>
      {active ? (
        <section
          className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5"
          role="tabpanel"
        >
          <h3 className="text-base font-semibold text-(--color-sheet-ink)">{active.title}</h3>
          <p className="mt-2 text-sm text-(--color-sheet-ink-soft)">{active.prompt}</p>
          {active.msfUrl ? (
            <a
              href={active.msfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-(--color-status-searching) hover:underline"
            >
              Explore on MySkillsFuture ↗
            </a>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
