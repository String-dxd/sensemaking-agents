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
 */
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { PROFILE_TAB_HEADERS, PROFILE_TAB_THEMES } from '~/data/profile-tabs'
import type {
  BelongingEntry,
  OutsidePerspectiveEntry,
  RelationshipMapEntry,
} from '~/engine/student-space/Game/State/Relationships.js'
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

export function RelationshipsPageView({
  disabled = false,
  map,
  belonging,
  perspectives,
  selfSide,
  actions,
}: RelationshipsPageViewProps) {
  const header = PROFILE_TAB_HEADERS.relationships
  const theme = PROFILE_TAB_THEMES.relationships

  return (
    <section className="flex w-full flex-col text-[#2b2620]" data-testid="relationships-page">
      <div className="w-full">
        <header className="border-b border-[#e3d8c4] pb-6">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-[#2b2620]/55">{header.eyebrow}</p>
            <span className="rounded-full bg-[#f1ede5] px-2 py-0.5 text-[11px] font-semibold text-[#2b2620]/70">
              {header.tag}
            </span>
          </div>
          <h1 className="mt-2 text-[clamp(1.6rem,4vw,2rem)] font-semibold leading-tight tracking-tight">
            {header.title}
          </h1>
          <p className="mt-2 text-sm text-[#2b2620]/60">{header.subtitle}</p>
        </header>

        <SectionMap entries={map} theme={theme} disabled={disabled} actions={actions} />
        <SectionBelonging entries={belonging} theme={theme} disabled={disabled} actions={actions} />
        <SectionPerspectives
          entries={perspectives}
          theme={theme}
          disabled={disabled}
          actions={actions}
          selfSide={selfSide}
        />
      </div>
    </section>
  )
}

// ── §1 — My relationship map ─────────────────────────────────────────────

function SectionMap({
  entries,
  theme,
  disabled,
  actions,
}: {
  entries: RelationshipMapEntry[]
  theme: (typeof PROFILE_TAB_THEMES)['relationships']
  disabled: boolean
  actions: RelationshipsActions
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section
      className="border-b border-[#e3d8c4] py-6"
      aria-labelledby="relationships-map-heading"
      data-testid="relationships-section-map"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="relationships-map-heading" className="text-xs font-semibold text-[#2b2620]/55">
          My relationship map
        </h2>
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
          theme={theme}
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            actions.addPerson(payload)
            setAdding(false)
          }}
        />
      ) : null}

      {entries.length === 0 && !adding ? (
        <p className="mt-4 text-sm italic text-[#2b2620]/55" data-testid="relationships-map-empty">
          No one named yet. Who&apos;s in your circle right now — family, CCA team, close friends,
          teachers?
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="relationships-map-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid={`relationships-map-entry-${entry.id}`}
              className={cn(
                'rounded-[14px] border-l-3 bg-white/60 px-4 py-3 text-sm',
                theme.border,
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('font-semibold', theme.text)}>{entry.name}</span>
                <Badge variant="secondary" size="sm" radius="sm">
                  {CATEGORY_LABEL[entry.category]}
                </Badge>
                {entry.quality ? (
                  <Badge size="sm" radius="sm" className={cn('font-medium', theme.callout)}>
                    {QUALITY_LABEL[entry.quality]}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-xs text-[#2b2620]/55 hover:text-[#2b2620]"
                  disabled={disabled}
                  onClick={() => actions.removePerson(entry.id)}
                  data-testid={`relationships-map-remove-${entry.id}`}
                >
                  remove
                </Button>
              </div>
              {entry.note ? (
                <p className="mt-2 whitespace-pre-wrap text-[#2b2620]/75">{entry.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function RelationshipPersonForm({
  theme,
  onSubmit,
  onCancel,
}: {
  theme: (typeof PROFILE_TAB_THEMES)['relationships']
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
      className={cn('mt-4 rounded-[14px] border bg-white/70 p-4', theme.border)}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSubmit({ name: name.trim(), category, quality, note: note.trim() || null })
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="relationships-map-form-name"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as RelationshipMapEntry['category'])}
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="relationships-map-form-category"
          >
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          Quality
          <select
            value={quality ?? ''}
            onChange={(e) =>
              setQuality((e.target.value || null) as RelationshipMapEntry['quality'])
            }
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="relationships-map-form-quality"
          >
            <option value="">(not set)</option>
            {Object.entries(QUALITY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="relationships-map-form-note"
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
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
  theme,
  disabled,
  actions,
}: {
  entries: BelongingEntry[]
  theme: (typeof PROFILE_TAB_THEMES)['relationships']
  disabled: boolean
  actions: RelationshipsActions
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section
      className="border-b border-[#e3d8c4] py-6"
      aria-labelledby="relationships-belonging-heading"
      data-testid="relationships-section-belonging"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="relationships-belonging-heading"
          className="text-xs font-semibold text-[#2b2620]/55"
        >
          Where I belong
        </h2>
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
          theme={theme}
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            actions.addBelonging(payload)
            setAdding(false)
          }}
        />
      ) : null}

      {entries.length === 0 && !adding ? (
        <p
          className="mt-4 text-sm italic text-[#2b2620]/55"
          data-testid="relationships-belonging-empty"
        >
          Which groups do you actually feel part of, and which are you just turning up to?
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="relationships-belonging-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid={`relationships-belonging-entry-${entry.id}`}
              className={cn(
                'rounded-[14px] border-l-3 bg-white/60 px-4 py-3 text-sm',
                theme.border,
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('font-semibold', theme.text)}>{entry.groupName}</span>
                <Badge variant="secondary" size="sm" radius="sm">
                  {GROUP_KIND_LABEL[entry.groupKind]}
                </Badge>
                <BelongLevelPill level={entry.belongLevel} theme={theme} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-xs text-[#2b2620]/55 hover:text-[#2b2620]"
                  disabled={disabled}
                  onClick={() => actions.removeBelonging(entry.id)}
                  data-testid={`relationships-belonging-remove-${entry.id}`}
                >
                  remove
                </Button>
              </div>
              {entry.note ? (
                <p className="mt-2 whitespace-pre-wrap text-[#2b2620]/75">{entry.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function BelongLevelPill({
  level,
  theme,
}: {
  level: BelongingEntry['belongLevel']
  theme: (typeof PROFILE_TAB_THEMES)['relationships']
}) {
  const intensity =
    level === 'belong'
      ? cn('font-medium', theme.callout)
      : level === 'participate'
        ? 'bg-white/70 text-[#2b2620] font-medium'
        : 'bg-white/40 text-[#2b2620]/65'
  return (
    <Badge size="sm" radius="sm" className={intensity}>
      {BELONG_LEVEL_LABEL[level]}
    </Badge>
  )
}

function BelongingForm({
  theme,
  onSubmit,
  onCancel,
}: {
  theme: (typeof PROFILE_TAB_THEMES)['relationships']
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
      className={cn('mt-4 rounded-[14px] border bg-white/70 p-4', theme.border)}
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
      <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        Group name
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          required
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="relationships-belonging-form-name"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          Kind
          <select
            value={groupKind}
            onChange={(e) => setGroupKind(e.target.value as BelongingEntry['groupKind'])}
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="relationships-belonging-form-kind"
          >
            {Object.entries(GROUP_KIND_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          How it feels
          <select
            value={belongLevel}
            onChange={(e) => setBelongLevel(e.target.value as BelongingEntry['belongLevel'])}
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
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
      <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="relationships-belonging-form-note"
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
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
  theme,
  disabled,
  actions,
  selfSide,
}: {
  entries: OutsidePerspectiveEntry[]
  theme: (typeof PROFILE_TAB_THEMES)['relationships']
  disabled: boolean
  actions: RelationshipsActions
  selfSide?: VipsSelfSideClaim[]
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section
      className="pb-14 pt-6"
      aria-labelledby="relationships-perspectives-heading"
      data-testid="relationships-section-perspectives"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="relationships-perspectives-heading"
          className="text-xs font-semibold text-[#2b2620]/55"
        >
          How others see me differently from how I see myself
        </h2>
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

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Left: self-side from VIPS (cross-tab reference, wired by U6) */}
        <div
          className="rounded-[14px] border border-dashed border-[#e3d8c4] bg-white/50 p-4"
          data-testid="relationships-perspectives-self-side"
        >
          <h3 className="text-[11px] font-semibold text-[#2b2620]/55">
            How I see myself (from VIPS)
          </h3>
          {selfSide && selfSide.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {selfSide.map((claim) => (
                <li
                  key={claim.dimension}
                  className="rounded-md bg-white/70 px-3 py-2"
                  data-testid={`relationships-self-side-${claim.dimension}`}
                >
                  <span className="text-[11px] font-semibold text-[#2b2620]/55">
                    {claim.dimension}
                  </span>
                  <p className="text-[#2b2620]">{claim.topClaimLabel}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm italic text-[#2b2620]/55">
              No VIPS signal yet — once you confirm a few reflections, your top claim per dimension
              will appear here for side-by-side comparison.
            </p>
          )}
        </div>

        {/* Right: outside observations */}
        <div className="flex flex-col gap-3">
          {adding ? (
            <PerspectiveForm
              theme={theme}
              onCancel={() => setAdding(false)}
              onSubmit={(payload) => {
                actions.addPerspective(payload)
                setAdding(false)
              }}
            />
          ) : null}

          {entries.length === 0 && !adding ? (
            <p
              className="text-sm italic text-[#2b2620]/55"
              data-testid="relationships-perspectives-empty"
            >
              Ask one peer, teacher, or coach what they see in you. Log one observation here — the
              point is the gap, not agreement.
            </p>
          ) : null}

          {entries.length > 0 ? (
            <ul className="flex flex-col gap-3" data-testid="relationships-perspectives-list">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  data-testid={`relationships-perspectives-entry-${entry.id}`}
                  className={cn(
                    'rounded-[14px] border-l-3 bg-white/60 px-4 py-3 text-sm',
                    theme.border,
                  )}
                >
                  <blockquote className="leading-relaxed text-[#2b2620]">
                    &ldquo;{entry.observation}&rdquo;
                  </blockquote>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#2b2620]/60">
                    <Badge variant="secondary" size="sm" radius="sm">
                      {entry.sourceLabel
                        ? `${SOURCE_LABEL[entry.source]} — ${entry.sourceLabel}`
                        : SOURCE_LABEL[entry.source]}
                    </Badge>
                    <Badge size="sm" radius="sm" className={cn('font-medium', theme.callout)}>
                      {AGREEMENT_LABEL[entry.agreementSelf]}
                    </Badge>
                    {entry.vipsDimensionRef ? (
                      <Badge variant="secondary" size="sm" radius="sm">
                        re: {entry.vipsDimensionRef}
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-xs text-[#2b2620]/55 hover:text-[#2b2620]"
                      disabled={disabled}
                      onClick={() => actions.removePerspective(entry.id)}
                      data-testid={`relationships-perspectives-remove-${entry.id}`}
                    >
                      remove
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
  theme,
  onSubmit,
  onCancel,
}: {
  theme: (typeof PROFILE_TAB_THEMES)['relationships']
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
      className={cn('rounded-[14px] border bg-white/70 p-4', theme.border)}
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
      <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
        Observation
        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={3}
          required
          className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
          data-testid="relationships-perspectives-form-observation"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          Source
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as OutsidePerspectiveEntry['source'])}
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="relationships-perspectives-form-source"
          >
            {Object.entries(SOURCE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          Source label (optional)
          <input
            type="text"
            value={sourceLabel}
            placeholder="e.g. Ms Tan, Aiden"
            onChange={(e) => setSourceLabel(e.target.value)}
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="relationships-perspectives-form-source-label"
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          Compared to how I see myself
          <select
            value={agreementSelf}
            onChange={(e) =>
              setAgreementSelf(e.target.value as OutsidePerspectiveEntry['agreementSelf'])
            }
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="relationships-perspectives-form-agreement"
          >
            {Object.entries(AGREEMENT_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#2b2620]/75">
          About which VIPS area? (optional)
          <select
            value={vipsDimensionRef ?? ''}
            onChange={(e) =>
              setVipsDimensionRef(
                (e.target.value || null) as OutsidePerspectiveEntry['vipsDimensionRef'],
              )
            }
            className="rounded-md border border-[#e3d8c4] bg-white px-3 py-2 text-sm text-[#2b2620]"
            data-testid="relationships-perspectives-form-vips"
          >
            <option value="">(not linked)</option>
            <option value="values">Values</option>
            <option value="interests">Interests</option>
            <option value="personality">Personality</option>
            <option value="skills">Skills</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
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
