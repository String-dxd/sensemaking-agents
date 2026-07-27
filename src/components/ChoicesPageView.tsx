/**
 * Choices — Profile tab at the same level as the four VIPS tabs.
 * Three sections (MECE):
 *   §1 Decisions I've made and why    — logged decisions + forces
 *   §2 Patterns in how I handle hard situations — manual tagging rollup
 *   §3 What I want to change                    — change intentions linked to §2 patterns
 *
 * Data lives in the engine `Choices` state slice (singleton + persist).
 *
 * Chrome follows the VIPS tabs in ProfileSheet: sheet ink/divider tokens,
 * `rounded-xl` hairline cards, and the tab accent reserved for the header
 * pill and the callout badges.
 */
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { PROFILE_TAB_HEADERS, PROFILE_TAB_THEMES } from '~/data/profile-tabs'
import type {
  ChangeIntention,
  DecisionEntry,
  DecisionForce,
  DecisionPatternTag,
} from '~/engine/student-space/Game/State/Choices.js'
import { DECISION_PATTERN_TAGS } from '~/engine/student-space/Game/State/Choices.js'
import { cn } from '~/lib/utils'

// Re-export so existing imports from this view keep working.
export type { ChangeIntention, DecisionEntry, DecisionForce, DecisionPatternTag }

// The picker order for the §1 force toggles. The slice itself does not need
// to know about UI ordering — schema.js validates against its own private
// set, and Choices.js exposes pattern tags only. Keeping this tuple here
// localises form chrome decisions to the view.
export const DECISION_FORCE_VALUES = [
  'consequential',
  'peer-acceptance',
  'values',
  'family',
  'gut',
  'other',
] as const satisfies readonly DecisionForce[]

// Alias the slice-side constant so existing call sites keep reading the
// same name.
export const DECISION_PATTERN_TAG_VALUES = DECISION_PATTERN_TAGS

export interface ChoicesActions {
  addDecision: (p: Partial<DecisionEntry>) => DecisionEntry | null
  removeDecision: (id: string) => string | null
  tagDecisionPattern: (id: string, tag: DecisionPatternTag | null) => DecisionEntry | null
  addChangeIntention: (p: Partial<ChangeIntention>) => ChangeIntention | null
  removeChangeIntention: (id: string) => string | null
}

export interface ChoicesPageViewProps {
  studentId?: string
  disabled?: boolean
  decisions: DecisionEntry[]
  intentions: ChangeIntention[]
  actions: ChoicesActions
  /**
   * @deprecated Always rendered without the legacy avatar+tab-rail chrome.
   * Kept on the type for callers that pass it; ignored at runtime.
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

// Shared chrome. Declared once so the three sections cannot drift apart, and
// so elevation is stated in exactly one place (a hairline border, no shadow).
const CARD =
  'rounded-xl border border-(color:--color-sheet-divider) bg-(--color-sheet-pane-left) p-4'
const EMPTY =
  'rounded-xl border border-(color:--color-sheet-divider) p-5 text-sm text-(--color-sheet-ink-soft)'
const SECTION_HEADING = 'text-xs font-semibold text-(--color-sheet-ink-soft)'
const INLINE_LABEL = 'text-xs font-semibold text-(--color-sheet-ink-soft)'
const FIELD_LABEL = 'flex flex-col gap-1.5 text-xs font-medium text-(--color-sheet-ink-soft)'
const FIELD =
  'rounded-lg border border-(color:--color-sheet-field) bg-white px-3 py-2 text-sm text-(--color-sheet-ink) transition-[border-color] focus-visible:border-(color:--profile-accent) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(color:--profile-accent)'
const REMOVE_BUTTON = 'ml-auto text-xs text-(--color-sheet-ink-soft) hover:text-(--color-sheet-ink)'
const TOGGLE =
  'relative cursor-pointer rounded-full border text-xs font-medium transition-[background-color,color,border-color,transform] before:absolute before:-inset-2 before:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(color:--profile-accent) active:scale-[0.96]'
const TOGGLE_OFF =
  'border-(color:--color-sheet-field) bg-white/70 text-(--color-sheet-ink-soft) hover:text-(--color-sheet-ink)'

// Set locally rather than inherited: ProfileSheet already declares these on the
// tab wrapper, but the view is also embedded standalone (dev design route) where
// nothing upstream would.
const THEME_VARS: CSSProperties = {
  '--profile-accent': PROFILE_TAB_THEMES.choices.accent,
  '--profile-soft': PROFILE_TAB_THEMES.choices.soft,
  '--profile-ink': PROFILE_TAB_THEMES.choices.ink,
} as CSSProperties

export function ChoicesPageView({
  disabled = false,
  decisions,
  intentions,
  actions,
}: ChoicesPageViewProps) {
  const header = PROFILE_TAB_HEADERS.choices

  const patternCounts = useMemo(() => computePatternCounts(decisions), [decisions])
  const dominantPatternTag = useMemo(() => computeDominantPattern(patternCounts), [patternCounts])

  return (
    <section
      className="flex w-full flex-col gap-8 text-(--color-sheet-ink)"
      style={THEME_VARS}
      data-testid="choices-page"
    >
      <header className="flex flex-col gap-3">
        <span className="w-fit rounded-full bg-(--profile-soft) px-2.5 py-1 text-xs font-semibold text-(--profile-ink)">
          {header.tag}
        </span>
        <div>
          <h2 className="text-2xl font-semibold leading-tight">{header.title}</h2>
          <p className="mt-1 text-sm text-(--color-sheet-ink-soft)">{header.subtitle}</p>
        </div>
      </header>

      <SectionDecisions decisions={decisions} disabled={disabled} actions={actions} />
      <SectionPatterns
        decisions={decisions}
        counts={patternCounts}
        dominantPatternTag={dominantPatternTag}
      />
      <SectionIntentions
        intentions={intentions}
        disabled={disabled}
        actions={actions}
        dominantPatternTag={dominantPatternTag}
      />
    </section>
  )
}

// ── §1 — Decisions I've made and why ────────────────────────────────────

function SectionDecisions({
  decisions,
  disabled,
  actions,
}: {
  decisions: DecisionEntry[]
  disabled: boolean
  actions: ChoicesActions
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section aria-labelledby="choices-decisions-heading" data-testid="choices-section-decisions">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="choices-decisions-heading" className={SECTION_HEADING}>
          Decisions I&apos;ve made and why
        </h3>
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
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            actions.addDecision(payload)
            setAdding(false)
          }}
        />
      ) : null}

      {decisions.length === 0 && !adding ? (
        <p className={EMPTY} data-testid="choices-decisions-empty">
          Log a real choice: CCA leadership, a subject combination, a conflict you handled. Name the
          options and what pushed you.
        </p>
      ) : null}

      {decisions.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="choices-decisions-list">
          {decisions.map((entry) => (
            <li
              key={entry.id}
              data-testid={`choices-decision-entry-${entry.id}`}
              className={cn(CARD, 'text-sm')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{entry.decision}</span>
                {entry.when ? (
                  <Badge variant="secondary" size="sm" radius="sm">
                    {entry.when}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className={REMOVE_BUTTON}
                  disabled={disabled}
                  onClick={() => actions.removeDecision(entry.id)}
                  data-testid={`choices-decision-remove-${entry.id}`}
                >
                  Remove
                </Button>
              </div>
              {entry.chose || entry.options.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1">
                  {entry.chose ? (
                    <p>
                      <span className={cn(INLINE_LABEL, 'mr-1.5')}>Chose</span>
                      {entry.chose}
                    </p>
                  ) : null}
                  {entry.options.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={INLINE_LABEL}>Rejected</span>
                      {entry.options
                        .filter((o) => o !== entry.chose)
                        .map((opt) => (
                          <Badge key={opt} variant="secondary" size="sm" radius="sm">
                            {opt}
                          </Badge>
                        ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {entry.forces.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={INLINE_LABEL}>Forces</span>
                  {entry.forces.map((f) => (
                    <Badge
                      key={f}
                      size="sm"
                      radius="sm"
                      className="bg-(--profile-soft) font-medium text-(--profile-ink)"
                    >
                      {FORCE_LABEL[f]}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {entry.note ? <p className="mt-2 whitespace-pre-wrap">{entry.note}</p> : null}
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
      <span className={INLINE_LABEL}>Pattern</span>
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
              TOGGLE,
              'px-2.5 py-0.5 disabled:pointer-events-none',
              active
                ? 'border-(color:--color-sheet-ink) bg-(--color-sheet-ink) text-white'
                : TOGGLE_OFF,
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
  onSubmit,
  onCancel,
}: {
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
      className={CARD}
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
      <label className={FIELD_LABEL}>
        Decision
        <input
          type="text"
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          required
          placeholder="CCA captain election"
          className={FIELD}
          data-testid="choices-decision-form-decision"
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          Options (comma-separated)
          <input
            type="text"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="stand for it, decline, propose someone else"
            className={FIELD}
            data-testid="choices-decision-form-options"
          />
        </label>
        <label className={FIELD_LABEL}>
          I chose
          <input
            type="text"
            value={chose}
            onChange={(e) => setChose(e.target.value)}
            placeholder="declined"
            className={FIELD}
            data-testid="choices-decision-form-chose"
          />
        </label>
      </div>
      <label className={cn(FIELD_LABEL, 'mt-3')}>
        When
        <input
          type="text"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          placeholder="last term, end of Sec 3"
          className={FIELD}
          data-testid="choices-decision-form-when"
        />
      </label>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-(--color-sheet-ink-soft)">
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
                  TOGGLE,
                  'px-3 py-1',
                  active
                    ? 'border-(color:--profile-accent) bg-(--profile-soft) text-(--profile-ink)'
                    : TOGGLE_OFF,
                )}
              >
                {FORCE_LABEL[f]}
              </button>
            )
          })}
        </div>
      </fieldset>
      <label className={cn(FIELD_LABEL, 'mt-3')}>
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={FIELD}
          data-testid="choices-decision-form-note"
        />
      </label>
      <div className="mt-4 flex items-center gap-2">
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
}: {
  decisions: DecisionEntry[]
  counts: Record<DecisionPatternTag, number>
  dominantPatternTag: DecisionPatternTag | null
}) {
  const taggedCount = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <section
      className="border-t border-(color:--color-sheet-divider) pt-8"
      aria-labelledby="choices-patterns-heading"
      data-testid="choices-section-patterns"
    >
      <h3 id="choices-patterns-heading" className={cn(SECTION_HEADING, 'mb-3 block')}>
        Patterns in how I handle hard situations
      </h3>
      {decisions.length === 0 ? (
        <p className={EMPTY} data-testid="choices-patterns-empty">
          Once you&apos;ve logged a few decisions, tag each one so the pattern surfaces here.
        </p>
      ) : taggedCount === 0 ? (
        <p className={EMPTY} data-testid="choices-patterns-untagged">
          You&apos;ve logged {decisions.length} decision{decisions.length === 1 ? '' : 's'}, none
          tagged yet. Pick a pattern on each one above.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3" data-testid="choices-patterns-rollup">
          {DECISION_PATTERN_TAG_VALUES.map((tag) => {
            const count = counts[tag]
            const isDominant = dominantPatternTag === tag
            return (
              <div
                key={tag}
                data-testid={`choices-patterns-cell-${tag}`}
                className={cn(
                  CARD,
                  isDominant && 'border-(color:--profile-accent) bg-(--profile-soft)',
                )}
              >
                <p
                  className={cn(
                    'font-semibold',
                    isDominant ? 'text-(--profile-ink)' : 'text-(--color-sheet-ink)',
                  )}
                >
                  {PATTERN_TAG_LABEL[tag]}
                </p>
                <p className="mt-0.5 text-xs text-(--color-sheet-ink-soft)">
                  {PATTERN_TAG_DESCRIPTION[tag]}
                </p>
                <p className="mt-3 text-xl font-semibold tabular-nums">
                  {count}
                  <span className="ml-1.5 text-xs font-normal text-(--color-sheet-ink-soft)">
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
  disabled,
  actions,
  dominantPatternTag,
}: {
  intentions: ChangeIntention[]
  disabled: boolean
  actions: ChoicesActions
  dominantPatternTag: DecisionPatternTag | null
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section
      className="border-t border-(color:--color-sheet-divider) pt-8"
      aria-labelledby="choices-intentions-heading"
      data-testid="choices-section-intentions"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="choices-intentions-heading" className={SECTION_HEADING}>
          What I want to change
        </h3>
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
          defaultPatternTag={dominantPatternTag}
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            actions.addChangeIntention(payload)
            setAdding(false)
          }}
        />
      ) : null}

      {intentions.length === 0 && !adding ? (
        <p className={EMPTY} data-testid="choices-intentions-empty">
          Given the pattern you see, what&apos;s one thing you want to do differently?
        </p>
      ) : null}

      {intentions.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="choices-intentions-list">
          {intentions.map((entry) => (
            <li
              key={entry.id}
              data-testid={`choices-intention-entry-${entry.id}`}
              className={cn(CARD, 'text-sm')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{entry.change}</span>
                {entry.linkedPatternTag ? (
                  <Badge
                    size="sm"
                    radius="sm"
                    className="bg-(--profile-soft) font-medium text-(--profile-ink)"
                  >
                    Pattern: {PATTERN_TAG_LABEL[entry.linkedPatternTag]}
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
                  className={REMOVE_BUTTON}
                  disabled={disabled}
                  onClick={() => actions.removeChangeIntention(entry.id)}
                  data-testid={`choices-intention-remove-${entry.id}`}
                >
                  Remove
                </Button>
              </div>
              {entry.current ? (
                <p className="mt-2">
                  <span className={cn(INLINE_LABEL, 'mr-1.5')}>Today</span>
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
  onSubmit,
  onCancel,
  defaultPatternTag,
}: {
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
  // Keep the select mirroring the dominant pattern tag while the user
  // hasn't explicitly picked a value. If the user tags a decision in §1
  // while the form is open, the pre-select updates accordingly.
  const [userTouchedPattern, setUserTouchedPattern] = useState(false)
  useEffect(() => {
    if (!userTouchedPattern) setLinkedPatternTag(defaultPatternTag)
  }, [defaultPatternTag, userTouchedPattern])
  const valid = change.trim().length > 0
  return (
    <form
      data-testid="choices-intention-form"
      className={CARD}
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
      <label className={FIELD_LABEL}>
        What do you want to change?
        <input
          type="text"
          value={change}
          onChange={(e) => setChange(e.target.value)}
          required
          placeholder="Pause one beat before answering"
          className={FIELD}
          data-testid="choices-intention-form-change"
        />
      </label>
      <label className={cn(FIELD_LABEL, 'mt-3')}>
        What does the current pattern look like?
        <textarea
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          rows={2}
          placeholder="I jump in fast and only realise later"
          className={FIELD}
          data-testid="choices-intention-form-current"
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          Linked pattern (optional)
          <select
            value={linkedPatternTag ?? ''}
            onChange={(e) => {
              setUserTouchedPattern(true)
              setLinkedPatternTag((e.target.value || null) as DecisionPatternTag | null)
            }}
            className={FIELD}
            data-testid="choices-intention-form-pattern"
          >
            <option value="">Not linked</option>
            {DECISION_PATTERN_TAG_VALUES.map((tag) => (
              <option key={tag} value={tag}>
                {PATTERN_TAG_LABEL[tag]}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          By when (optional)
          <input
            type="text"
            value={byWhen}
            onChange={(e) => setByWhen(e.target.value)}
            placeholder="end of term, next CCA meeting"
            className={FIELD}
            data-testid="choices-intention-form-bywhen"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
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
