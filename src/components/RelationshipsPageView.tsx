/**
 * Relationships — Profile tab at the same level as the four VIPS tabs.
 * Three sections (MECE):
 *   §1  My relationship map         — who is in my life, by category + quality
 *   §2  Where I belong              — groups I feel part of vs participate in
 *   §3  How others see me           — outside observations, side-by-side with VIPS
 *
 * Data lives in the engine `Relationships` state slice (singleton + persist).
 * §3 cross-tab linkage to VIPS lands in U6 (this file renders the layout,
 * the self-side column hooks into VIPS pages in the U6 wiring).
 *
 * Chrome follows the VIPS tabs in ProfileSheet: sheet ink/divider tokens,
 * `rounded-xl` hairline cards, and the tab accent reserved for the header
 * pill and the callout badges.
 */
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { PROFILE_TAB_HEADERS, PROFILE_TAB_THEMES } from '~/data/profile-tabs'
import type {
  BelongingEntry,
  OutsidePerspectiveEntry,
  RelationshipMapEntry,
} from '~/engine/student-space/Game/State/Relationships.js'
import { DIMENSION_LABEL } from '~/lib/profile-tokens'
import type { VipsSelfSideClaim } from '~/lib/student-space/vips-self-side'
import { cn } from '~/lib/utils'

// Re-export so existing imports from this view keep working.
export type { BelongingEntry, OutsidePerspectiveEntry, RelationshipMapEntry, VipsSelfSideClaim }

export interface RelationshipsActions {
  addPerson: (p: Partial<RelationshipMapEntry>) => RelationshipMapEntry | null
  removePerson: (id: string) => string | null
  addBelonging: (p: Partial<BelongingEntry>) => BelongingEntry | null
  removeBelonging: (id: string) => string | null
  addPerspective: (p: Partial<OutsidePerspectiveEntry>) => OutsidePerspectiveEntry | null
  removePerspective: (id: string) => string | null
}

export interface RelationshipsPageViewProps {
  studentId?: string
  disabled?: boolean
  map: RelationshipMapEntry[]
  belonging: BelongingEntry[]
  perspectives: OutsidePerspectiveEntry[]
  /** VIPS self-side claims for §3 cross-tab comparison. Wired by U6. */
  selfSide?: VipsSelfSideClaim[]
  actions: RelationshipsActions
  /**
   * @deprecated Always rendered without the legacy avatar+tab-rail chrome.
   * Kept on the type for callers that pass it; ignored at runtime.
   */
  omitChrome?: boolean
}

const CATEGORY_LABEL: Record<RelationshipMapEntry['category'], string> = {
  family: 'Family',
  cca: 'CCA',
  'close-friend': 'Close friend',
  teacher: 'Teacher',
  other: 'Other',
}

const QUALITY_LABEL: Record<NonNullable<RelationshipMapEntry['quality']>, string> = {
  'rely-on': 'I rely on them',
  'give-to': 'I give to them',
  mutual: 'Mutual',
  uncertain: 'Not sure yet',
}

const GROUP_KIND_LABEL: Record<BelongingEntry['groupKind'], string> = {
  cca: 'CCA',
  class: 'Class',
  school: 'School',
  society: 'Society',
  other: 'Other',
}

const BELONG_LEVEL_LABEL: Record<BelongingEntry['belongLevel'], string> = {
  belong: 'Belong',
  participate: 'Participate',
  edge: 'On the edge',
}

const SOURCE_LABEL: Record<OutsidePerspectiveEntry['source'], string> = {
  peer: 'Peer',
  teacher: 'Teacher',
  coach: 'Coach',
  family: 'Family',
  other: 'Other',
}

const AGREEMENT_LABEL: Record<OutsidePerspectiveEntry['agreementSelf'], string> = {
  matches: 'Matches how I see myself',
  partly: 'Partly matches',
  differs: 'Differs from how I see myself',
  unknown: 'Not compared yet',
}

// Shared chrome. Declared once so the three sections cannot drift apart, and
// so elevation is stated in exactly one place (a hairline border, no shadow).
const CARD =
  'rounded-xl border border-(color:--color-sheet-divider) bg-(--color-sheet-pane-left) p-4'
const EMPTY =
  'rounded-xl border border-(color:--color-sheet-divider) p-5 text-sm text-(--color-sheet-ink-soft)'
const SECTION_HEADING = 'text-xs font-semibold text-(--color-sheet-ink-soft)'
const FIELD_LABEL = 'flex flex-col gap-1.5 text-xs font-medium text-(--color-sheet-ink-soft)'
const FIELD =
  'rounded-lg border border-(color:--color-sheet-field) bg-white px-3 py-2 text-sm text-(--color-sheet-ink) transition-[border-color] focus-visible:border-(color:--profile-accent) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(color:--profile-accent)'
const REMOVE_BUTTON = 'ml-auto text-xs text-(--color-sheet-ink-soft) hover:text-(--color-sheet-ink)'

// Set locally rather than inherited: ProfileSheet already declares these on the
// tab wrapper, but the view is also embedded standalone (dev design route, the
// engine bridge) where nothing upstream would.
const THEME_VARS: CSSProperties = {
  '--profile-accent': PROFILE_TAB_THEMES.relationships.accent,
  '--profile-soft': PROFILE_TAB_THEMES.relationships.soft,
  '--profile-ink': PROFILE_TAB_THEMES.relationships.ink,
} as CSSProperties

export function RelationshipsPageView({
  disabled = false,
  map,
  belonging,
  perspectives,
  selfSide,
  actions,
}: RelationshipsPageViewProps) {
  const header = PROFILE_TAB_HEADERS.relationships

  return (
    <section
      className="flex w-full flex-col gap-8 text-(--color-sheet-ink)"
      style={THEME_VARS}
      data-testid="relationships-page"
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

      <SectionMap entries={map} disabled={disabled} actions={actions} />
      <SectionBelonging entries={belonging} disabled={disabled} actions={actions} />
      <SectionPerspectives
        entries={perspectives}
        disabled={disabled}
        actions={actions}
        selfSide={selfSide}
      />
    </section>
  )
}

// ── §1 — My relationship map ─────────────────────────────────────────────

function SectionMap({
  entries,
  disabled,
  actions,
}: {
  entries: RelationshipMapEntry[]
  disabled: boolean
  actions: RelationshipsActions
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section aria-labelledby="relationships-map-heading" data-testid="relationships-section-map">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="relationships-map-heading" className={SECTION_HEADING}>
          My relationship map
        </h3>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || adding}
          onClick={() => setAdding(true)}
          data-testid="relationships-map-add"
        >
          Add a person
        </Button>
      </div>

      {adding ? (
        <RelationshipPersonForm
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            actions.addPerson(payload)
            setAdding(false)
          }}
        />
      ) : null}

      {entries.length === 0 && !adding ? (
        <p className={EMPTY} data-testid="relationships-map-empty">
          Nobody here yet. Add the people who are in your week: family, CCA, close friends,
          teachers.
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="relationships-map-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid={`relationships-map-entry-${entry.id}`}
              className={cn(CARD, 'text-sm')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{entry.name}</span>
                <Badge variant="secondary" size="sm" radius="sm">
                  {CATEGORY_LABEL[entry.category]}
                </Badge>
                {entry.quality ? (
                  <Badge
                    size="sm"
                    radius="sm"
                    className="bg-(--profile-soft) font-medium text-(--profile-ink)"
                  >
                    {QUALITY_LABEL[entry.quality]}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className={REMOVE_BUTTON}
                  disabled={disabled}
                  onClick={() => actions.removePerson(entry.id)}
                  data-testid={`relationships-map-remove-${entry.id}`}
                >
                  Remove
                </Button>
              </div>
              {entry.note ? <p className="mt-2 whitespace-pre-wrap">{entry.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function RelationshipPersonForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: Partial<RelationshipMapEntry>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<RelationshipMapEntry['category']>('close-friend')
  const [quality, setQuality] = useState<RelationshipMapEntry['quality']>(null)
  const [note, setNote] = useState('')
  const valid = name.trim().length > 0
  return (
    <form
      data-testid="relationships-map-form"
      className={CARD}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSubmit({ name: name.trim(), category, quality, note: note.trim() || null })
      }}
    >
      <label className={FIELD_LABEL}>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={FIELD}
          data-testid="relationships-map-form-name"
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as RelationshipMapEntry['category'])}
            className={FIELD}
            data-testid="relationships-map-form-category"
          >
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          Quality
          <select
            value={quality ?? ''}
            onChange={(e) =>
              setQuality((e.target.value || null) as RelationshipMapEntry['quality'])
            }
            className={FIELD}
            data-testid="relationships-map-form-quality"
          >
            <option value="">Not set</option>
            {Object.entries(QUALITY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={cn(FIELD_LABEL, 'mt-3')}>
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={FIELD}
          data-testid="relationships-map-form-note"
        />
      </label>
      <div className="mt-4 flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="accent"
          disabled={!valid}
          data-testid="relationships-map-form-submit"
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          data-testid="relationships-map-form-cancel"
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ── §2 — Where I belong ──────────────────────────────────────────────────

function SectionBelonging({
  entries,
  disabled,
  actions,
}: {
  entries: BelongingEntry[]
  disabled: boolean
  actions: RelationshipsActions
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section
      className="border-t border-(color:--color-sheet-divider) pt-8"
      aria-labelledby="relationships-belonging-heading"
      data-testid="relationships-section-belonging"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="relationships-belonging-heading" className={SECTION_HEADING}>
          Where I belong
        </h3>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || adding}
          onClick={() => setAdding(true)}
          data-testid="relationships-belonging-add"
        >
          Add a group
        </Button>
      </div>

      {adding ? (
        <BelongingForm
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            actions.addBelonging(payload)
            setAdding(false)
          }}
        />
      ) : null}

      {entries.length === 0 && !adding ? (
        <p className={EMPTY} data-testid="relationships-belonging-empty">
          Which groups do you actually feel part of, and which are you just turning up to?
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="relationships-belonging-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid={`relationships-belonging-entry-${entry.id}`}
              className={cn(CARD, 'text-sm')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{entry.groupName}</span>
                <Badge variant="secondary" size="sm" radius="sm">
                  {GROUP_KIND_LABEL[entry.groupKind]}
                </Badge>
                <BelongLevelPill level={entry.belongLevel} />
                <Button
                  size="sm"
                  variant="ghost"
                  className={REMOVE_BUTTON}
                  disabled={disabled}
                  onClick={() => actions.removeBelonging(entry.id)}
                  data-testid={`relationships-belonging-remove-${entry.id}`}
                >
                  Remove
                </Button>
              </div>
              {entry.note ? <p className="mt-2 whitespace-pre-wrap">{entry.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function BelongLevelPill({ level }: { level: BelongingEntry['belongLevel'] }) {
  // Three levels, three weights — the pill's own emphasis carries the level
  // instead of a separate icon or color code.
  const intensity =
    level === 'belong'
      ? 'bg-(--profile-soft) font-medium text-(--profile-ink)'
      : level === 'participate'
        ? 'bg-white/70 font-medium text-(--color-sheet-ink)'
        : 'bg-white/40 text-(--color-sheet-ink-soft)'
  return (
    <Badge size="sm" radius="sm" className={intensity}>
      {BELONG_LEVEL_LABEL[level]}
    </Badge>
  )
}

function BelongingForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: Partial<BelongingEntry>) => void
  onCancel: () => void
}) {
  const [groupName, setGroupName] = useState('')
  const [groupKind, setGroupKind] = useState<BelongingEntry['groupKind']>('cca')
  const [belongLevel, setBelongLevel] = useState<BelongingEntry['belongLevel']>('participate')
  const [note, setNote] = useState('')
  const valid = groupName.trim().length > 0
  return (
    <form
      data-testid="relationships-belonging-form"
      className={CARD}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSubmit({
          groupName: groupName.trim(),
          groupKind,
          belongLevel,
          note: note.trim() || null,
        })
      }}
    >
      <label className={FIELD_LABEL}>
        Group name
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          required
          className={FIELD}
          data-testid="relationships-belonging-form-name"
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          Kind
          <select
            value={groupKind}
            onChange={(e) => setGroupKind(e.target.value as BelongingEntry['groupKind'])}
            className={FIELD}
            data-testid="relationships-belonging-form-kind"
          >
            {Object.entries(GROUP_KIND_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          How it feels
          <select
            value={belongLevel}
            onChange={(e) => setBelongLevel(e.target.value as BelongingEntry['belongLevel'])}
            className={FIELD}
            data-testid="relationships-belonging-form-level"
          >
            {Object.entries(BELONG_LEVEL_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={cn(FIELD_LABEL, 'mt-3')}>
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={FIELD}
          data-testid="relationships-belonging-form-note"
        />
      </label>
      <div className="mt-4 flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="accent"
          disabled={!valid}
          data-testid="relationships-belonging-form-submit"
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          data-testid="relationships-belonging-form-cancel"
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ── §3 — How others see me ────────────────────────────────────────────────

function SectionPerspectives({
  entries,
  disabled,
  actions,
  selfSide,
}: {
  entries: OutsidePerspectiveEntry[]
  disabled: boolean
  actions: RelationshipsActions
  selfSide?: VipsSelfSideClaim[]
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section
      className="border-t border-(color:--color-sheet-divider) pt-8"
      aria-labelledby="relationships-perspectives-heading"
      data-testid="relationships-section-perspectives"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="relationships-perspectives-heading" className={SECTION_HEADING}>
          How others see me differently from how I see myself
        </h3>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || adding}
          onClick={() => setAdding(true)}
          data-testid="relationships-perspectives-add"
        >
          Log an observation
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: self-side from VIPS (cross-tab reference, wired by U6) */}
        <div className={CARD} data-testid="relationships-perspectives-self-side">
          <h4 className={SECTION_HEADING}>How I see myself (from VIPS)</h4>
          {selfSide && selfSide.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {selfSide.map((claim) => (
                <li
                  key={claim.dimension}
                  className="rounded-lg bg-white/70 px-3 py-2"
                  data-testid={`relationships-self-side-${claim.dimension}`}
                >
                  <span className="text-xs font-semibold text-(--color-sheet-ink-soft)">
                    {DIMENSION_LABEL[claim.dimension]}
                  </span>
                  <p>{claim.topClaimLabel}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-(--color-sheet-ink-soft)">
              No VIPS signal yet. Confirm a few reflections and your strongest claim in each area
              shows up here.
            </p>
          )}
        </div>

        {/* Right: outside observations */}
        <div className="flex flex-col gap-3">
          {adding ? (
            <PerspectiveForm
              onCancel={() => setAdding(false)}
              onSubmit={(payload) => {
                actions.addPerspective(payload)
                setAdding(false)
              }}
            />
          ) : null}

          {entries.length === 0 && !adding ? (
            <p className={EMPTY} data-testid="relationships-perspectives-empty">
              Ask a peer, teacher, or coach what they see in you, then log what they said here.
            </p>
          ) : null}

          {entries.length > 0 ? (
            <ul className="flex flex-col gap-3" data-testid="relationships-perspectives-list">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  data-testid={`relationships-perspectives-entry-${entry.id}`}
                  className={cn(CARD, 'text-sm')}
                >
                  <blockquote className="leading-relaxed">
                    &ldquo;{entry.observation}&rdquo;
                  </blockquote>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" size="sm" radius="sm">
                      {entry.sourceLabel
                        ? `${SOURCE_LABEL[entry.source]} · ${entry.sourceLabel}`
                        : SOURCE_LABEL[entry.source]}
                    </Badge>
                    <Badge
                      size="sm"
                      radius="sm"
                      className="bg-(--profile-soft) font-medium text-(--profile-ink)"
                    >
                      {AGREEMENT_LABEL[entry.agreementSelf]}
                    </Badge>
                    {entry.vipsDimensionRef ? (
                      <Badge variant="secondary" size="sm" radius="sm">
                        About {DIMENSION_LABEL[entry.vipsDimensionRef]}
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className={REMOVE_BUTTON}
                      disabled={disabled}
                      onClick={() => actions.removePerspective(entry.id)}
                      data-testid={`relationships-perspectives-remove-${entry.id}`}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function PerspectiveForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: Partial<OutsidePerspectiveEntry>) => void
  onCancel: () => void
}) {
  const [observation, setObservation] = useState('')
  const [source, setSource] = useState<OutsidePerspectiveEntry['source']>('peer')
  const [sourceLabel, setSourceLabel] = useState('')
  const [agreementSelf, setAgreementSelf] =
    useState<OutsidePerspectiveEntry['agreementSelf']>('unknown')
  const [vipsDimensionRef, setVipsDimensionRef] =
    useState<OutsidePerspectiveEntry['vipsDimensionRef']>(null)
  const valid = observation.trim().length > 0
  return (
    <form
      data-testid="relationships-perspectives-form"
      className={CARD}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSubmit({
          observation: observation.trim(),
          source,
          sourceLabel: sourceLabel.trim() || null,
          agreementSelf,
          vipsDimensionRef,
        })
      }}
    >
      <label className={FIELD_LABEL}>
        Observation
        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={3}
          required
          className={FIELD}
          data-testid="relationships-perspectives-form-observation"
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          Source
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as OutsidePerspectiveEntry['source'])}
            className={FIELD}
            data-testid="relationships-perspectives-form-source"
          >
            {Object.entries(SOURCE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          Source label (optional)
          <input
            type="text"
            value={sourceLabel}
            placeholder="Mr. Tan, Aiden"
            onChange={(e) => setSourceLabel(e.target.value)}
            className={FIELD}
            data-testid="relationships-perspectives-form-source-label"
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          Compared to how I see myself
          <select
            value={agreementSelf}
            onChange={(e) =>
              setAgreementSelf(e.target.value as OutsidePerspectiveEntry['agreementSelf'])
            }
            className={FIELD}
            data-testid="relationships-perspectives-form-agreement"
          >
            {Object.entries(AGREEMENT_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          About which VIPS area? (optional)
          <select
            value={vipsDimensionRef ?? ''}
            onChange={(e) =>
              setVipsDimensionRef(
                (e.target.value || null) as OutsidePerspectiveEntry['vipsDimensionRef'],
              )
            }
            className={FIELD}
            data-testid="relationships-perspectives-form-vips"
          >
            <option value="">Not linked</option>
            <option value="values">Values</option>
            <option value="interests">Interests</option>
            <option value="personality">Personality</option>
            <option value="skills">Skills</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="accent"
          disabled={!valid}
          data-testid="relationships-perspectives-form-submit"
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          data-testid="relationships-perspectives-form-cancel"
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
