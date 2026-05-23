import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  PageSurface,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetIdentityHeader,
  SheetSidebar,
  SheetTitle,
  usePageEscape,
} from '~/components/ui/sheet'
import type {
  ChoiceDecisionShape,
  ChoiceIntentionShape,
  FacetsInput,
} from '~/engine/student-space/Game/View/statusHeuristics.js'
import {
  actionsForCluster,
  DIFFUSED_NUDGES,
  FORECLOSED_CHALLENGE_PROMPT,
  STARTER_PROMPT,
  STATUS_IDS,
  statusCopyOf,
  statusFor,
  statusLabelOf,
} from '~/engine/student-space/Game/View/statusHeuristics.js'
import {
  ecgChipOf,
  traitChipOf,
  trajectoryFor,
} from '~/engine/student-space/Game/View/trajectoryHeuristics.js'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { cn } from '~/lib/utils'

/**
 * Path Finder, migrated from the pre-React engine HTML surface.
 *
 * The old sheet did two distinct jobs:
 * - classify the student's identity-status frame with `statusFor`
 * - render or mint a trajectory reading with `trajectoryFor`
 *
 * Keeping those jobs separate restores the pre-migration behavior: the page
 * shows the status-specific copy, optional reason/why disclosures, generated
 * pathway metadata, and the evidence-bearing pathway panel.
 */
type StatusKey = 'starter' | 'diffused' | 'searching' | 'foreclosed' | 'achieved'

interface TrajectoryAudit {
  status: StatusKey
  reason: string
  isOverride?: boolean
  inferredStatus?: StatusKey
}

interface Bearing {
  title?: string
  prompt?: string
  clusterId?: string
  msfUrl?: string
  traitTags?: string[]
  ecgTags?: string[]
  risk?: string
}

interface TrajectoryCapture {
  kind?: string
  createdAt: string
  backendCartographerOutputId?: string | number | null
  trajectory?: {
    throughLine?: string
    bearings?: Bearing[]
  }
}

type Subscribable = { subscribe: (cb: () => void) => () => void }
type CapturesLike = Subscribable & {
  entries?: Array<TrajectoryCapture> | (() => Array<TrajectoryCapture>)
  add?: (input: { kind: string; trajectory: TrajectoryCapture['trajectory'] }) => TrajectoryCapture
}
type ChoicesLike = Subscribable & {
  decisions?: Array<ChoiceDecisionShape & { chose?: string; decision?: string }>
  intentions?: Array<ChoiceIntentionShape & { change?: string }>
  dominantPatternTag?: () => string | null
}
type ProfileLike = Subscribable & {
  displayCompanionName?: () => string
  identity?: unknown
  facets?: FacetsInput
}
type EngineState = {
  captures?: CapturesLike
  profile?: ProfileLike
  choices?: ChoicesLike | null
  backend?: {
    runTrajectory?: () => Promise<unknown>
    refreshSnapshot?: () => Promise<unknown>
  } | null
  applyBackendSnapshot?: (snapshot: unknown) => unknown
  backendActive?: boolean
  identityStatusOverride?:
    | (Subscribable & {
        current?: StatusKey | null
        setOverride?: (status: StatusKey | null) => void
      })
    | null
}

export function TrajectorySheet() {
  const engine = useEngine()
  const navigate = useNavigate()

  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  const state = (engine as unknown as { state?: EngineState } | null)?.state
  useEngineSliceVersion(state?.identityStatusOverride ?? null)
  useEngineSliceVersion(state?.profile ?? null)
  useEngineSliceVersion(state?.captures ?? null)
  useEngineSliceVersion(state?.choices ?? null)

  const [escapeHatch, setEscapeHatch] = useState(false)
  const [running, setRunning] = useState(false)

  const entries = captureEntries(state?.captures)
  const audit = currentAudit(state)
  const renderStatus: StatusKey | null = audit ? (escapeHatch ? 'searching' : audit.status) : null
  const existingCapture =
    audit && renderStatus && needsBearings(renderStatus)
      ? latestTrajectoryCapture(entries, Boolean(state?.backendActive))
      : null
  const previewCapture =
    audit &&
    renderStatus &&
    needsBearings(renderStatus) &&
    !existingCapture &&
    !state?.backendActive
      ? generatedTrajectoryCapture(state)
      : null
  const capture = existingCapture ?? previewCapture

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
      const snapshot = await state.backend.refreshSnapshot?.()
      if (snapshot) state.applyBackendSnapshot?.(snapshot)
    } finally {
      setRunning(false)
    }
  }, [state])

  const dismissToHome = useCallback(() => navigate({ to: '/' }), [navigate])
  usePageEscape(dismissToHome)

  if (!audit || !renderStatus) {
    return (
      <PageSurface>
        <SheetContent>
          <SheetBody>
            <p className="text-sm text-(--color-sheet-ink-soft)">Loading Path Finder...</p>
          </SheetBody>
        </SheetContent>
      </PageSurface>
    )
  }

  const identity = state?.profile?.identity ?? null
  const copy = (statusCopyOf(renderStatus, identity as never) ?? {}) as {
    title?: string
    tldr?: string
    lead?: string
  }
  const companion = state?.profile?.displayCompanionName?.() || 'Kira'
  const showRun = Boolean(state?.backend?.runTrajectory && needsBearings(renderStatus))
  const showEscape = audit.status !== 'starter' && audit.status !== 'searching' && !escapeHatch

  return (
    <PageSurface>
      <SheetSidebar>
        <SheetIdentityHeader>
          <SheetTitle>Path Finder</SheetTitle>
          <SheetDescription>Bearings drawn from the patterns in your reflections.</SheetDescription>
        </SheetIdentityHeader>
        <div className="space-y-5 px-7 pb-8">
          <StatusPreviewSelector
            audit={audit}
            override={state?.identityStatusOverride ?? null}
            onSelect={() => setEscapeHatch(false)}
          />
          <div className="space-y-2">
            {copy.title ? (
              <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-(--color-sheet-ink)">
                {copy.title}
              </h2>
            ) : null}
            {copy.tldr ? (
              <p className="mt-1 text-pretty text-sm leading-relaxed text-(--color-sheet-ink-soft)">
                {copy.tldr}
              </p>
            ) : null}
          </div>
          <TrajectoryMeta capture={capture} status={renderStatus} />
          <div className="flex flex-wrap gap-2">
            {showRun ? (
              <button
                type="button"
                onClick={runBackend}
                disabled={running}
                data-testid="trajectory-run"
                className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-[rgba(160,118,89,0.28)] bg-white/70 px-4 text-sm font-semibold text-[#7a4b2e] transition-[background-color,transform,opacity] duration-150 ease-(--ease-sheet) hover:bg-white active:scale-[0.96] disabled:cursor-wait disabled:opacity-70"
              >
                {running ? 'Running…' : 'Run sense-making'}
              </button>
            ) : null}
            {showEscape ? (
              <button
                type="button"
                onClick={() => setEscapeHatch(true)}
                data-testid="trajectory-escape"
                className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-(--color-sheet-divider) bg-white/35 px-4 text-sm font-medium text-(--color-sheet-ink) transition-[background-color,transform] duration-150 ease-(--ease-sheet) hover:bg-black/5 active:scale-[0.96]"
              >
                Show me all paths
              </button>
            ) : null}
            {escapeHatch ? (
              <button
                type="button"
                onClick={() => setEscapeHatch(false)}
                data-testid="trajectory-back"
                className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-(--color-sheet-divider) bg-white/35 px-4 text-sm font-medium text-(--color-sheet-ink) transition-[background-color,transform] duration-150 ease-(--ease-sheet) hover:bg-black/5 active:scale-[0.96]"
              >
                Back to {statusLabelOf(audit.status)}
              </button>
            ) : null}
          </div>
          {copy.lead && copy.lead !== (copy.tldr || copy.lead) ? (
            <InlineDisclosure label="Why this status">
              <p className="text-sm leading-relaxed text-(--color-sheet-ink-soft)">{copy.lead}</p>
            </InlineDisclosure>
          ) : null}
        </div>
      </SheetSidebar>
      <SheetContent>
        <SheetBody>
          <StatusBody
            status={renderStatus}
            capture={capture}
            companion={companion}
            backendActive={state?.backendActive}
            hasBackend={Boolean(state?.backend?.runTrajectory)}
            committedDirection={readCommittedDirection(state?.choices)}
            onAsk={openAsk}
          />
        </SheetBody>
      </SheetContent>
    </PageSurface>
  )
}

function currentAudit(state: EngineState | undefined): TrajectoryAudit | null {
  if (!state) return null
  const entries = captureEntries(state.captures)
  const inferred = statusFor({
    facets: state.profile?.facets,
    captures: entries,
    decisions: state.choices?.decisions,
    intentions: state.choices?.intentions,
    dominantPatternTag: state.choices?.dominantPatternTag?.() || null,
  }) as TrajectoryAudit | undefined

  if (!inferred?.status) return null
  const overrideId = state.identityStatusOverride?.current ?? null
  if (!overrideId || overrideId === inferred.status) return { ...inferred, isOverride: false }

  return {
    ...inferred,
    status: overrideId,
    isOverride: true,
    inferredStatus: inferred.status,
    reason:
      `Previewing as ${statusLabelOf(overrideId)}. ` +
      `Inferred status from current evidence is ${statusLabelOf(inferred.status)}. ` +
      inferred.reason,
  }
}

function captureEntries(captures: CapturesLike | null | undefined): TrajectoryCapture[] {
  const entries = captures?.entries
  if (Array.isArray(entries)) return entries
  if (typeof entries === 'function') return entries()
  return []
}

function needsBearings(status: StatusKey): boolean {
  return status !== 'starter' && status !== 'diffused'
}

function generatedTrajectoryCapture(state: EngineState | undefined): TrajectoryCapture {
  const identity = state?.profile?.identity as { name?: string | null } | null | undefined
  const trajectory = trajectoryFor(state?.profile?.facets, identity) as
    | TrajectoryCapture['trajectory']
    | undefined
  return {
    kind: 'trajectory',
    createdAt: new Date().toISOString(),
    trajectory,
  }
}

function latestTrajectoryCapture(
  entries: TrajectoryCapture[],
  backendActive: boolean,
): TrajectoryCapture | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const capture = entries[i]
    if (
      capture?.kind === 'trajectory' &&
      capture.trajectory &&
      capture.backendCartographerOutputId
    ) {
      return capture
    }
  }
  if (backendActive) return null
  for (let i = entries.length - 1; i >= 0; i--) {
    const capture = entries[i]
    if (capture?.kind === 'trajectory' && capture.trajectory) return capture
  }
  return null
}

function StatusPreviewSelector({
  audit,
  override,
  onSelect,
}: {
  audit: TrajectoryAudit
  override: EngineState['identityStatusOverride']
  onSelect?: () => void
}) {
  const [open, setOpen] = useState(false)
  const current = override?.current ?? null

  useEffect(() => {
    if (!open) return
    const onDocClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.('[data-trajectory-status-root]')) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const activeLabel = current ? statusLabelOf(audit.status) : 'Auto'

  return (
    <div data-trajectory-status-root className="relative space-y-2">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-faint)">
        Previewing as
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="trajectory-status-pill"
        onClick={() => setOpen((next) => !next)}
        className="inline-flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded-full bg-white/76 py-1.5 pl-3 pr-2.5 text-sm font-semibold text-(--color-sheet-ink) shadow-[inset_0_0_0_1px_rgba(43,38,32,0.08)] transition-[transform,background-color] duration-150 ease-(--ease-sheet) hover:bg-white active:scale-[0.96]"
      >
        <span
          aria-hidden
          className={cn('size-2.5 shrink-0 rounded-full', statusDotColor[audit.status])}
        />
        <span className="min-w-0 truncate">{activeLabel}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-(--color-sheet-ink-soft) transition-transform duration-150 ease-(--ease-sheet)',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-2 w-56 origin-top-left animate-[trajectoryMenuIn_140ms_cubic-bezier(0.22,1,0.36,1)_both] overflow-hidden rounded-2xl border border-(--color-sheet-divider) bg-white p-1 shadow-xl shadow-black/10">
          {[null, ...STATUS_IDS].map((status) => {
            const key = status ?? 'auto'
            const selected = current === status
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                data-selected={selected || undefined}
                onClick={() => {
                  onSelect?.()
                  override?.setOverride?.(status as StatusKey | null)
                  setOpen(false)
                }}
                className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-(--color-sheet-ink-soft) transition-colors duration-100 hover:bg-black/5 hover:text-(--color-sheet-ink) data-[selected]:bg-(--color-sheet-tab-active) data-[selected]:text-(--color-sheet-ink)"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    status ? statusDotColor[status] : 'bg-(--color-sheet-ink-faint)',
                  )}
                />
                <span className="min-w-0 truncate">{status ? statusLabelOf(status) : 'Auto'}</span>
              </button>
            )
          })}
        </div>
      ) : null}
      {audit.isOverride ? (
        <p className="max-w-[34ch] text-pretty text-xs leading-relaxed text-(--color-sheet-ink-soft)">
          {audit.reason}
        </p>
      ) : null}
    </div>
  )
}

const statusDotColor: Record<StatusKey, string> = {
  starter: 'bg-[#c2a572]',
  diffused: 'bg-[#b88660]',
  searching: 'bg-[#4f8acb]',
  foreclosed: 'bg-[#c97a4e]',
  achieved: 'bg-[#4f9b6a]',
}

function TrajectoryMeta({
  capture,
  status,
}: {
  capture: TrajectoryCapture | null
  status: StatusKey
}) {
  if (!capture?.trajectory || !needsBearings(status)) return null
  const bearings = capture.trajectory.bearings ?? []
  const generatedAt = new Date(capture.createdAt)
  const count = bearings.length
  return (
    <div className="grid grid-cols-2 gap-2">
      <StatTile value={String(count)} label={count === 1 ? 'Pathway' : 'Pathways'} />
      <StatTile value={relativeTime(generatedAt)} label="Last generated" />
    </div>
  )
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-white/55 px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(43,38,32,0.045),0_1px_0_rgba(255,255,255,0.65)_inset]">
      <p className="text-lg font-bold leading-none text-(--color-sheet-ink) tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-(--color-sheet-ink-soft)">
        {label}
      </p>
    </div>
  )
}

function relativeTime(date: Date): string {
  const ms = Date.now() - date.getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

function InlineDisclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section data-expanded={open} className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
        className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-(--color-sheet-divider) bg-white/35 px-3.5 py-1.5 text-xs font-semibold text-(--color-sheet-ink-soft) transition-[background-color,color,transform] duration-150 ease-(--ease-sheet) hover:bg-black/5 hover:text-(--color-sheet-ink) active:scale-[0.96]"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 transition-transform duration-150 ease-(--ease-sheet)',
            open && 'rotate-180',
          )}
        />
        {label}
      </button>
      {open ? (
        <div className="animate-[trajectoryMenuIn_160ms_cubic-bezier(0.22,1,0.36,1)_both]">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function StatusBody({
  status,
  capture,
  companion,
  backendActive,
  hasBackend,
  committedDirection,
  onAsk,
}: {
  status: StatusKey
  capture: TrajectoryCapture | null
  companion: string
  backendActive?: boolean
  hasBackend: boolean
  committedDirection: string | null
  onAsk: (prompt: string) => void
}) {
  if (status === 'starter') {
    const title = (STARTER_PROMPT.title as string).replace('{companionName}', companion)
    return (
      <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-6">
        <p className="text-balance text-base font-semibold text-(--color-sheet-ink)">{title}</p>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-(--color-sheet-ink-soft)">
          {STARTER_PROMPT.prompt}
        </p>
        <button
          type="button"
          onClick={() => onAsk(STARTER_PROMPT.prompt as string)}
          data-testid="trajectory-starter-cta"
          className="mt-5 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-(--color-onb-accent) px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_4px_12px_-4px_rgba(226,106,60,0.45)] transition-[background-color,transform] duration-150 ease-(--ease-sheet) hover:bg-(--color-onb-accent-deep) active:scale-[0.96]"
        >
          Start a chat with {companion} <span aria-hidden>→</span>
        </button>
      </div>
    )
  }

  if (status === 'diffused') {
    const nudges = DIFFUSED_NUDGES as unknown as Array<{ title: string; prompt: string }>
    return (
      <section className="mx-auto max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
          Pick a nudge
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {nudges.map((nudge) => (
            <li key={nudge.prompt}>
              <button
                type="button"
                onClick={() => onAsk(nudge.prompt)}
                className="group w-full cursor-pointer rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4 text-left text-sm transition-[background-color,transform,border-color] duration-150 ease-(--ease-sheet) hover:border-[rgba(43,38,32,0.12)] hover:bg-black/5 active:scale-[0.98]"
              >
                <span className="block text-balance font-semibold text-(--color-sheet-ink)">
                  {nudge.title}
                </span>
                <span className="mt-1 block text-pretty leading-relaxed text-(--color-sheet-ink-soft)">
                  {nudge.prompt}
                </span>
                <span className="mt-3 block text-xs font-semibold text-[#7a4b2e]">
                  Reflect with {companion} →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (!capture?.trajectory) {
    return (
      <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-6">
        <p className="text-balance font-semibold text-(--color-sheet-ink)">
          {backendActive
            ? 'No backend trajectory has been generated yet.'
            : 'No trajectory has been generated yet.'}
        </p>
        <p className="mt-2 text-pretty text-sm text-(--color-sheet-ink-soft)">
          {hasBackend
            ? 'Run sense-making to generate a Cartographer trajectory.'
            : 'Open Path Finder after more profile evidence is available.'}
        </p>
      </div>
    )
  }

  if (status === 'foreclosed') {
    return (
      <ForeclosedBody
        capture={capture}
        companion={companion}
        committedDirection={committedDirection}
        onAsk={onAsk}
      />
    )
  }

  if (status === 'achieved') {
    return <AchievedBody capture={capture} />
  }

  return <SearchingBody capture={capture} />
}

function SearchingBody({ capture }: { capture: TrajectoryCapture }) {
  const bearings = capture.trajectory?.bearings ?? []
  const [activeIndex, setActiveIndex] = useState(0)
  const selectedIndex = Math.min(activeIndex, Math.max(0, bearings.length - 1))
  const active = bearings[selectedIndex]
  const throughLine = (capture.trajectory?.throughLine ?? '').trim()

  if (bearings.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-6">
        <p className="font-semibold text-(--color-sheet-ink)">No pathways are available yet.</p>
        <p className="mt-2 text-sm text-(--color-sheet-ink-soft)">
          Capture a few more reflections and Path Finder will sharpen the compass.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {throughLine ? (
        <p className="max-w-[62ch] text-pretty text-base leading-relaxed text-(--color-sheet-ink)">
          {throughLine}
        </p>
      ) : null}
      <div className="grid gap-4">
        <div
          className="grid content-start gap-1.5 rounded-2xl border border-(--color-sheet-divider) bg-white/45 p-1.5 sm:grid-cols-3"
          role="tablist"
          aria-label="Pathway options"
        >
          {bearings.map((bearing, i) => (
            <button
              key={bearing.title ?? i}
              type="button"
              role="tab"
              aria-selected={i === selectedIndex}
              onClick={() => setActiveIndex(i)}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm leading-tight transition-[background-color,color,box-shadow,transform] duration-150 ease-(--ease-sheet) active:scale-[0.98]',
                i === selectedIndex
                  ? 'bg-white text-[#2166aa] shadow-[inset_0_0_0_1px_rgba(79,138,203,0.36),0_1px_2px_rgba(79,138,203,0.12)]'
                  : 'text-(--color-sheet-ink-soft) hover:bg-black/5 hover:text-(--color-sheet-ink)',
              )}
            >
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums transition-colors duration-150',
                  i === selectedIndex
                    ? 'bg-[#d4e6fb] text-[#2166aa]'
                    : 'bg-black/8 text-(--color-sheet-ink-soft)',
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 whitespace-normal">{bearing.title}</span>
            </button>
          ))}
        </div>
        {active ? (
          <section
            className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-6 shadow-[0_1px_0_rgba(255,255,255,0.55)_inset]"
            role="tabpanel"
          >
            <header className="flex items-start gap-4">
              <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--color-sheet-ink-soft) tabular-nums">
                Path {selectedIndex + 1}
              </span>
              <h3 className="text-balance text-xl font-semibold leading-tight text-(--color-sheet-ink)">
                {active.title}
              </h3>
            </header>
            <p className="mt-4 text-pretty text-sm leading-relaxed text-(--color-sheet-ink)">
              {active.prompt}
            </p>
            <EvidenceDisclosure key={selectedIndex} bearing={active} />
            {active.msfUrl ? (
              <a
                href={active.msfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[#2b2620] px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-150 ease-(--ease-sheet) hover:bg-[#3a342b] active:scale-[0.96]"
              >
                Explore on MySkillsFuture
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}

function EvidenceDisclosure({ bearing }: { bearing: Bearing }) {
  const traits = bearing.traitTags ?? []
  const ecg = bearing.ecgTags ?? []
  const hasEvidence = traits.length > 0 || ecg.length > 0 || Boolean(bearing.risk)
  if (!hasEvidence) return null

  return (
    <div className="mt-5">
      <InlineDisclosure label="See evidence">
        <div className="space-y-4 rounded-xl bg-white/45 p-4 shadow-[inset_0_0_0_1px_rgba(43,38,32,0.045)]">
          {traits.length > 0 ? (
            <ChipGroup label="Trait combination">
              {traits.map((id) => (
                <TraitChip key={id} id={id} />
              ))}
            </ChipGroup>
          ) : null}
          {ecg.length > 0 ? (
            <ChipGroup label="ECG region tags">
              {ecg.map((id) => (
                <EcgChip key={id} id={id} />
              ))}
            </ChipGroup>
          ) : null}
          {bearing.risk ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--color-sheet-ink-soft)">
                Risks and tradeoffs
              </p>
              <p className="mt-1 text-sm leading-relaxed text-(--color-sheet-ink-soft)">
                {bearing.risk}
              </p>
            </div>
          ) : null}
        </div>
      </InlineDisclosure>
    </div>
  )
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--color-sheet-ink-soft)">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function TraitChip({ id }: { id: string }) {
  const chip = traitChipOf(id) as { kicker?: string; label: string; title: string }
  return (
    <span
      title={chip.title}
      className="inline-flex items-center gap-1 rounded-full bg-[rgba(43,38,32,0.055)] px-2.5 py-1 text-xs text-(--color-sheet-ink)"
    >
      {chip.kicker ? (
        <>
          <span className="font-semibold text-(--color-sheet-ink-soft)">{chip.kicker}</span>
          <span aria-hidden className="text-(--color-sheet-ink-soft)">
            →
          </span>
        </>
      ) : null}
      <span>{chip.label}</span>
    </span>
  )
}

function EcgChip({ id }: { id: string }) {
  const chip = ecgChipOf(id) as { label: string; title: string }
  return (
    <span
      title={chip.title}
      className="inline-flex rounded-full border border-[rgba(79,138,203,0.22)] bg-[rgba(79,138,203,0.08)] px-2.5 py-1 text-xs text-[#365f87]"
    >
      {chip.label}
    </span>
  )
}

function ForeclosedBody({
  capture,
  companion,
  committedDirection,
  onAsk,
}: {
  capture: TrajectoryCapture
  companion: string
  committedDirection: string | null
  onAsk: (prompt: string) => void
}) {
  const bearings = (capture.trajectory?.bearings ?? []).slice(0, 2)
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {committedDirection ? (
        <section className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
            Your committed direction
          </p>
          <p className="mt-2 text-balance text-base font-semibold text-(--color-sheet-ink)">
            {committedDirection}
          </p>
        </section>
      ) : null}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
          Worth holding up next to yours
        </p>
        <ol className="mt-3 space-y-3">
          {bearings.map((bearing, i) => (
            <li
              key={bearing.title ?? i}
              className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4"
            >
              <h3 className="flex gap-3 text-balance text-sm font-semibold text-(--color-sheet-ink)">
                <span className="text-(--color-sheet-ink-soft) tabular-nums">{i + 1}</span>
                {bearing.title}
              </h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-(--color-sheet-ink-soft)">
                {bearing.prompt}
              </p>
            </li>
          ))}
        </ol>
      </section>
      <section className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5">
        <p className="text-balance text-sm font-semibold text-(--color-sheet-ink)">
          {FORECLOSED_CHALLENGE_PROMPT.title}
        </p>
        <button
          type="button"
          onClick={() => onAsk(FORECLOSED_CHALLENGE_PROMPT.prompt as string)}
          className="mt-3 inline-flex min-h-10 cursor-pointer items-center rounded-full bg-(--color-onb-accent) px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_4px_12px_-4px_rgba(226,106,60,0.45)] transition-[background-color,transform] duration-150 ease-(--ease-sheet) hover:bg-(--color-onb-accent-deep) active:scale-[0.96]"
        >
          Open the question with {companion} →
        </button>
      </section>
    </div>
  )
}

function AchievedBody({ capture }: { capture: TrajectoryCapture }) {
  const bearings = capture.trajectory?.bearings ?? []
  return (
    <ol className="mx-auto max-w-3xl space-y-4">
      {bearings.map((bearing, i) => {
        const actions = (actionsForCluster(bearing.clusterId) ?? []) as string[]
        return (
          <li
            key={bearing.title ?? i}
            className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5"
          >
            <header className="flex items-start gap-3">
              <span className="text-sm font-semibold text-(--color-sheet-ink-soft) tabular-nums">
                {i + 1}
              </span>
              <h3 className="text-balance text-base font-semibold text-(--color-sheet-ink)">
                {bearing.title}
              </h3>
            </header>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-(--color-sheet-ink-soft)">
              {bearing.prompt}
            </p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
              Next concrete steps
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-(--color-sheet-ink) marker:text-(--color-sheet-ink-faint)">
              {actions.map((action) => (
                <li key={action} className="text-pretty">
                  {action}
                </li>
              ))}
            </ol>
            {bearing.msfUrl ? (
              <a
                href={bearing.msfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[#2b2620] px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-150 ease-(--ease-sheet) hover:bg-[#3a342b] active:scale-[0.96]"
              >
                Explore on MySkillsFuture
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function readCommittedDirection(choices: ChoicesLike | null | undefined): string | null {
  const intentions = choices?.intentions
  if (Array.isArray(intentions) && intentions.length > 0) {
    const latest = intentions[intentions.length - 1]
    if (latest?.change) return latest.change
  }
  const decisions = choices?.decisions
  if (Array.isArray(decisions) && decisions.length > 0) {
    const latest = decisions[decisions.length - 1]
    if (latest?.chose) return latest.chose
    if (latest?.decision) return latest.decision
  }
  return null
}
