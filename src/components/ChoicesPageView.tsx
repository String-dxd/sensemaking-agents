/**
 * Choices — Profile tab at the same level as the four VIPS tabs.
 * Three sections (MECE):
 *   §1 Decisions I've made and why    — logged decisions + forces
 *   §2 Patterns in how I handle hard situations — manual tagging rollup
 *   §3 What I want to change                    — change intentions linked to §2 patterns
 *
 * Data lives in the engine `Choices` state slice (singleton + persist).
 */
import { useMemo, useState } from 'react'
import {
  type FloatingAuthMenuState,
  getProfileTabTheme,
  ProfileStudentChrome,
  type ProfileStudentIdentity,
} from '~/components/ProfileSheetChrome'
import type { SheetKey } from '~/components/SheetEntryRail'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { PROFILE_TAB_HEADERS } from '~/data/profile-tabs'
import { cn } from '~/lib/utils'

export const DECISION_FORCE_VALUES = [
  'consequential',
  'peer-acceptance',
  'values',
  'family',
  'gut',
  'other',
] as const
export type DecisionForce = (typeof DECISION_FORCE_VALUES)[number]

export const DECISION_PATTERN_TAG_VALUES = ['avoidant', 'impulsive', 'deliberate'] as const
export type DecisionPatternTag = (typeof DECISION_PATTERN_TAG_VALUES)[number]

export interface DecisionEntry {
  id: string
  createdAt: string
  decision: string
  options: readonly string[]
  chose: string
  forces: readonly DecisionForce[]
  when: string
  note: string | null
  patternTag: DecisionPatternTag | null
}

export interface ChangeIntention {
  id: string
  createdAt: string
  current: string
  change: string
  byWhen: string | null
  linkedPatternTag: DecisionPatternTag | null
}

export interface ChoicesActions {
  addDecision: (p: Partial<DecisionEntry>) => DecisionEntry | null
  removeDecision: (id: string) => string | null
  tagDecisionPattern: (id: string, tag: DecisionPatternTag | null) => DecisionEntry | null
  addChangeIntention: (p: Partial<ChangeIntention>) => ChangeIntention | null
  removeChangeIntention: (id: string) => string | null
}

export interface ChoicesPageViewProps {
  studentId?: string
  authMenu?: FloatingAuthMenuState
  studentProfile?: ProfileStudentIdentity | null
  openSheet?: SheetKey | null
  onOpenSheet?: (key: SheetKey) => void
  sheetPanelId?: string
  disabled?: boolean
  decisions: DecisionEntry[]
  intentions: ChangeIntention[]
  actions: ChoicesActions
  /**
   * Skip rendering the chrome (avatar + tab rail). Used when the view is
   * embedded inside the engine ProfileSheet, which provides its own chrome.
   */
  omitChrome?: boolean
}

const FORCE_LABEL: Record<DecisionForce, string> = {
  consequential: 'Consequences',
  'peer-acceptance': 'Peer acceptance',
  values: 'Values',
  family: 'Family',
  gut: 'Gut feel',
  other: 'Other',
}

const PATTERN_TAG_LABEL: Record<DecisionPatternTag, string> = {
  avoidant: 'Avoidant',
  impulsive: 'Impulsive',
  deliberate: 'Deliberate',
}

const PATTERN_TAG_DESCRIPTION: Record<DecisionPatternTag, string> = {
  avoidant: 'I tend to delay or sidestep the choice',
  impulsive: 'I tend to decide fast without weighing it',
  deliberate: 'I tend to weigh options before deciding',
}

export function ChoicesPageView({
  authMenu,
  studentProfile,
  openSheet,
  onOpenSheet,
  sheetPanelId,
  disabled = false,
  decisions,
  intentions,
  actions,
  omitChrome = false,
}: ChoicesPageViewProps) {
  const header = PROFILE_TAB_HEADERS.choices
  const theme = getProfileTabTheme('choices')

  const patternCounts = useMemo(() => computePatternCounts(decisions), [decisions])
  const dominantPatternTag = useMemo(() => computeDominantPattern(patternCounts), [patternCounts])

  return (
    <section
      className={
        omitChrome
          ? 'flex w-full flex-col text-[#2b2620]'
          : 'mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-t-[1.75rem] bg-gradient-to-b from-[#fdfaf3] to-[#efe7d5] text-[#2b2620]'
      }
      data-testid="choices-page"
    >
      {omitChrome ? null : (
        <ProfileStudentChrome
          authMenu={authMenu}
          studentProfile={studentProfile}
          activeDimension="choices"
          openSheet={openSheet ?? 'choices'}
          onOpenSheet={onOpenSheet}
          sheetPanelId={sheetPanelId}
          disabled={disabled}
        />
      )}

      <div className={omitChrome ? 'w-full' : 'mx-auto w-full max-w-[760px] px-6 py-5'}>
        <header className="border-b border-[#e3d8c4] pb-6">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
              {header.eyebrow}
            </p>
            <span className="rounded-full bg-[#f1ede5] px-2 py-0.5 text-[11px] font-semibold text-[#2b2620]/70">
              {header.tag}
            </span>
          </div>
          <h1 className="mt-2 text-[clamp(1.6rem,4vw,2rem)] font-semibold leading-tight tracking-tight">
            {header.title}
          </h1>
          <p className="mt-2 text-sm text-[#2b2620]/60">{header.subtitle}</p>
        </header>

        <SectionDecisions
          decisions={decisions}
          theme={theme}
          disabled={disabled}
          actions={actions}
        />
        <SectionPatterns
          decisions={decisions}
          counts={patternCounts}
          dominantPatternTag={dominantPatternTag}
          theme={theme}
        />
        <SectionIntentions
          intentions={intentions}
          theme={theme}
          disabled={disabled}
          actions={actions}
          dominantPatternTag={dominantPatternTag}
        />
      </div>
    </section>
  )
}

// ── §1 — Decisions I've made and why ────────────────────────────────────

function SectionDecisions({
  decisions,
  theme,
  disabled,
  actions,
}: {
  decisions: DecisionEntry[]
  theme: ReturnType<typeof getProfileTabTheme>
  disabled: boolean
  actions: ChoicesActions
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section
      className="border-b border-[#e3d8c4] py-6"
      aria-labelledby="choices-decisions-heading"
      data-testid="choices-section-decisions"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="choices-decisions-heading"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55"
        >
          Decisions I&apos;ve made and why
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || adding}
          onClick={() => setAdding(true)}
          data-testid="choices-decisions-add"
        >
          Log a decision
        </Button>
      </div>

      {adding ? (
        <DecisionForm
          theme={theme}
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            actions.addDecision(payload)
            setAdding(false)
          }}
        />
      ) : null}

      {decisions.length === 0 && !adding ? (
        <p className="mt-4 text-sm italic text-[#2b2620]/55" data-testid="choices-decisions-empty">
          Log a real choice — CCA leadership, subject combination, a conflict you handled. Name your
          options and what pushed you.
        </p>
      ) : null}

      {decisions.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="choices-decisions-list">
          {decisions.map((entry) => (
            <li
              key={entry.id}
              data-testid={`choices-decision-entry-${entry.id}`}
              className={cn(
                'rounded-[14px] border-l-3 bg-white/60 px-4 py-3 text-sm',
                theme.border,
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('font-semibold', theme.text)}>{entry.decision}</span>
                {entry.when ? (
                  <Badge variant="secondary" size="sm" radius="sm">
                    {entry.when}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-xs text-[#2b2620]/55 hover:text-[#2b2620]"
                  disabled={disabled}
                  onClick={() => actions.removeDecision(entry.id)}
                  data-testid={`choices-decision-remove-${entry.id}`}
                >
                  remove
                </Button>
              </div>
              {entry.chose || entry.options.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1 text-[#2b2620]/80">
                  {entry.chose ? (
                    <p>
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#2b2620]/55">
                        chose:&nbsp;
                      </span>
                      {entry.chose}
                    </p>
                  ) : null}
                  {entry.options.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#2b2620]/55">
                        rejected:
                      </span>
                      {entry.options
                        .filter((o) => o !== entry.chose)
                        .map((opt) => (
                          <Badge
                            key={opt}
                            variant="secondary"
                            size="sm"
                            radius="sm"
                            className="text-[#2b2620]/60"
                          >
                            {opt}
                          </Badge>
                        ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {entry.forces.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#2b2620]/55">
                    forces:
                  </span>
                  {entry.forces.map((f) => (
                    <Badge
                      key={f}
                      size="sm"
                      radius="sm"
                      className={cn('font-medium', theme.callout)}
                    >
                      {FORCE_LABEL[f]}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {entry.note ? (
                <p className="mt-2 whitespace-pre-wrap text-[#2b2620]/80">{entry.note}</p>
              ) : null}
              <PatternTagPicker
                entry={entry}
                disabled={disabled}
                onChange={(tag) => actions.tagDecisionPattern(entry.id, tag)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function PatternTagPicker({
  entry,
  disabled,
  onChange,
}: {
  entry: DecisionEntry
  disabled: boolean
  onChange: (tag: DecisionPatternTag | null) => void
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#2b2620]/55">
        pattern:
      </span>
      {DECISION_PATTERN_TAG_VALUES.map((tag) => {
        const active = entry.patternTag === tag
        return (
          <button
            key={tag}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : tag)}
            aria-pressed={active}
            data-testid={`choices-decision-tag-${entry.id}-${tag}`}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
              active
                ? 'border-[#2b2620] bg-[#2b2620] text-white'
                : 'border-[#e3d8c4] bg-white/70 text-[#2b2620]/65 hover:text-[#2b2620]',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {PATTERN_TAG_LABEL[tag]}
          </button>
        )
      })}
    </div>
  )
}

function DecisionForm({
  theme,
  onSubmit,
  onCancel,
}: {
  theme: ReturnType<typeof getProfileTabTheme>
  onSubmit: (payload: Partial<DecisionEntry>) => void
  onCancel: () => void
}) {
  const [decision, setDecision] = useState('')
  const [options, setOptions] = useState('')
  const [chose, setChose] = useState('')
  const [when, setWhen] = useState('')
  const [forces, setForces] = useState<DecisionForce[]>([])
  const [note, setNote] = useState('')
  const valid = decision.trim().length > 0

  return (
    <form
      data-testid="choices-decision-form"
      className={cn('mt-4 rounded-[14px] border bg-white/70 p-4', theme.border)}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const parsedOptions = options
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
        onSubmit({
          decision: decision.trim(),
          options: parsedOptions,
          chose: chose.trim(),
          when: when.trim(),
          forces,
          note: note.trim() || null,
        })
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        Decision
        <input
          type="text"
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          required
          placeholder="CCA captain election"
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="choices-decision-form-decision"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          Options (comma-separated)
          <input
            type="text"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="stand for it, decline, propose someone else"
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="choices-decision-form-options"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          I chose
          <input
            type="text"
            value={chose}
            onChange={(e) => setChose(e.target.value)}
            placeholder="declined"
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="choices-decision-form-chose"
          />
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        When
        <input
          type="text"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          placeholder="last term, end of Sec 3, etc."
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="choices-decision-form-when"
        />
      </label>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-[#2b2620]/75">
          Forces that pushed me (pick all that apply)
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DECISION_FORCE_VALUES.map((f) => {
            const active = forces.includes(f)
            return (
              <button
                key={f}
                type="button"
                onClick={() =>
                  setForces((curr) => (active ? curr.filter((c) => c !== f) : [...curr, f]))
                }
                aria-pressed={active}
                data-testid={`choices-decision-form-force-${f}`}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? cn('font-medium', theme.callout, theme.border)
                    : 'border-[#e3d8c4] bg-white text-[#2b2620]/65 hover:text-[#2b2620]',
                )}
              >
                {FORCE_LABEL[f]}
              </button>
            )
          })}
        </div>
      </fieldset>
      <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="choices-decision-form-note"
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="accent"
          disabled={!valid}
          data-testid="choices-decision-form-submit"
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          data-testid="choices-decision-form-cancel"
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ── §2 — Patterns ────────────────────────────────────────────────────────

function SectionPatterns({
  decisions,
  counts,
  dominantPatternTag,
  theme,
}: {
  decisions: DecisionEntry[]
  counts: Record<DecisionPatternTag, number>
  dominantPatternTag: DecisionPatternTag | null
  theme: ReturnType<typeof getProfileTabTheme>
}) {
  const taggedCount = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <section
      className="border-b border-[#e3d8c4] py-6"
      aria-labelledby="choices-patterns-heading"
      data-testid="choices-section-patterns"
    >
      <h2
        id="choices-patterns-heading"
        className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55"
      >
        Patterns in how I handle hard situations
      </h2>
      {decisions.length === 0 ? (
        <p className="mt-4 text-sm italic text-[#2b2620]/55" data-testid="choices-patterns-empty">
          Once you&apos;ve logged a few decisions, tag each one so the pattern surfaces here.
        </p>
      ) : taggedCount === 0 ? (
        <p
          className="mt-4 text-sm italic text-[#2b2620]/55"
          data-testid="choices-patterns-untagged"
        >
          You&apos;ve logged {decisions.length} decision{decisions.length === 1 ? '' : 's'} but
          haven&apos;t tagged any yet. Open §1 and pick a pattern on each one.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="choices-patterns-rollup">
          {DECISION_PATTERN_TAG_VALUES.map((tag) => {
            const count = counts[tag]
            const isDominant = dominantPatternTag === tag
            return (
              <div
                key={tag}
                data-testid={`choices-patterns-cell-${tag}`}
                className={cn(
                  'rounded-[14px] border bg-white/60 p-4',
                  isDominant ? cn(theme.border, theme.callout) : 'border-[#e3d8c4]',
                )}
              >
                <p className={cn('text-base font-semibold', isDominant ? theme.text : '')}>
                  {PATTERN_TAG_LABEL[tag]}
                </p>
                <p className="text-xs text-[#2b2620]/65">{PATTERN_TAG_DESCRIPTION[tag]}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {count}
                  <span className="ml-1 text-xs font-normal text-[#2b2620]/55">
                    {count === 1 ? 'decision' : 'decisions'}
                  </span>
                </p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── §3 — What I want to change ───────────────────────────────────────────

function SectionIntentions({
  intentions,
  theme,
  disabled,
  actions,
  dominantPatternTag,
}: {
  intentions: ChangeIntention[]
  theme: ReturnType<typeof getProfileTabTheme>
  disabled: boolean
  actions: ChoicesActions
  dominantPatternTag: DecisionPatternTag | null
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section
      className="pb-14 pt-6"
      aria-labelledby="choices-intentions-heading"
      data-testid="choices-section-intentions"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="choices-intentions-heading"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55"
        >
          What I want to change
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || adding}
          onClick={() => setAdding(true)}
          data-testid="choices-intentions-add"
        >
          Add an intention
        </Button>
      </div>

      {adding ? (
        <IntentionForm
          theme={theme}
          defaultPatternTag={dominantPatternTag}
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            actions.addChangeIntention(payload)
            setAdding(false)
          }}
        />
      ) : null}

      {intentions.length === 0 && !adding ? (
        <p className="mt-4 text-sm italic text-[#2b2620]/55" data-testid="choices-intentions-empty">
          Given the pattern you see, what&apos;s one thing you want to do differently?
        </p>
      ) : null}

      {intentions.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="choices-intentions-list">
          {intentions.map((entry) => (
            <li
              key={entry.id}
              data-testid={`choices-intention-entry-${entry.id}`}
              className={cn(
                'rounded-[14px] border-l-3 bg-white/60 px-4 py-3 text-sm',
                theme.border,
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('font-semibold', theme.text)}>{entry.change}</span>
                {entry.linkedPatternTag ? (
                  <Badge size="sm" radius="sm" className={cn('font-medium', theme.callout)}>
                    pattern: {PATTERN_TAG_LABEL[entry.linkedPatternTag]}
                  </Badge>
                ) : null}
                {entry.byWhen ? (
                  <Badge variant="secondary" size="sm" radius="sm">
                    by {entry.byWhen}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-xs text-[#2b2620]/55 hover:text-[#2b2620]"
                  disabled={disabled}
                  onClick={() => actions.removeChangeIntention(entry.id)}
                  data-testid={`choices-intention-remove-${entry.id}`}
                >
                  remove
                </Button>
              </div>
              {entry.current ? (
                <p className="mt-2 text-[#2b2620]/75">
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#2b2620]/55">
                    today:&nbsp;
                  </span>
                  {entry.current}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function IntentionForm({
  theme,
  onSubmit,
  onCancel,
  defaultPatternTag,
}: {
  theme: ReturnType<typeof getProfileTabTheme>
  onSubmit: (payload: Partial<ChangeIntention>) => void
  onCancel: () => void
  defaultPatternTag: DecisionPatternTag | null
}) {
  const [current, setCurrent] = useState('')
  const [change, setChange] = useState('')
  const [byWhen, setByWhen] = useState('')
  const [linkedPatternTag, setLinkedPatternTag] = useState<DecisionPatternTag | null>(
    defaultPatternTag,
  )
  const valid = change.trim().length > 0
  return (
    <form
      data-testid="choices-intention-form"
      className={cn('mt-4 rounded-[14px] border bg-white/70 p-4', theme.border)}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSubmit({
          current: current.trim(),
          change: change.trim(),
          byWhen: byWhen.trim() || null,
          linkedPatternTag,
        })
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        What do you want to change?
        <input
          type="text"
          value={change}
          onChange={(e) => setChange(e.target.value)}
          required
          placeholder="Pause one beat before answering"
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="choices-intention-form-change"
        />
      </label>
      <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        What does the current pattern look like?
        <textarea
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          rows={2}
          placeholder="I jump in fast and only later realise…"
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="choices-intention-form-current"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          Linked pattern (optional)
          <select
            value={linkedPatternTag ?? ''}
            onChange={(e) =>
              setLinkedPatternTag((e.target.value || null) as DecisionPatternTag | null)
            }
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="choices-intention-form-pattern"
          >
            <option value="">(not linked)</option>
            {DECISION_PATTERN_TAG_VALUES.map((tag) => (
              <option key={tag} value={tag}>
                {PATTERN_TAG_LABEL[tag]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          By when (optional)
          <input
            type="text"
            value={byWhen}
            onChange={(e) => setByWhen(e.target.value)}
            placeholder="end of term, next CCA meeting…"
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="choices-intention-form-bywhen"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="accent"
          disabled={!valid}
          data-testid="choices-intention-form-submit"
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          data-testid="choices-intention-form-cancel"
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────

function computePatternCounts(decisions: DecisionEntry[]): Record<DecisionPatternTag, number> {
  const counts: Record<DecisionPatternTag, number> = { avoidant: 0, impulsive: 0, deliberate: 0 }
  for (const d of decisions) {
    if (d.patternTag) counts[d.patternTag] += 1
  }
  return counts
}

function computeDominantPattern(
  counts: Record<DecisionPatternTag, number>,
): DecisionPatternTag | null {
  const ranked = DECISION_PATTERN_TAG_VALUES.map((tag) => ({ tag, count: counts[tag] }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
  const top = ranked[0]
  if (!top) return null
  const runnerUp = ranked[1]
  if (runnerUp && runnerUp.count === top.count) return null
  return top.tag
}
