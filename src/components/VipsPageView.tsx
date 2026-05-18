/**
 * Renders one VIPS dimension's profile page. The shell follows the
 * Student Space profile IA: student identity, four tabs, ranked claim rows,
 * compiled read, open question, collection, and timeline.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  DIMENSION_LABEL,
  type FloatingAuthMenuState,
  PROFILE_HEADERS,
  PROFILE_THEMES,
  ProfileStudentChrome,
  type ProfileStudentIdentity,
} from '~/components/ProfileSheetChrome'
import type { SheetKey } from '~/components/SheetEntryRail'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { VIPS_TAXONOMY, type VipsDimension, type VipsTaxonomyEntry } from '~/data/vips-taxonomy'
import type { VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'
import { cn } from '~/lib/utils'
import { forgetTimelineEntry } from '~/server/forget-timeline-entry.functions'

export interface VipsPageViewProps {
  studentId: string
  dimension: VipsDimension
  page: VipsPageRow
  timeline: VipsTimelineEntryRow[]
  authMenu?: FloatingAuthMenuState
  studentProfile?: ProfileStudentIdentity | null
  openSheet?: SheetKey | null
  onOpenSheet?: (key: SheetKey) => void
  sheetPanelId?: string
  disabled?: boolean
}

export function VipsPageView({
  studentId,
  dimension,
  page,
  timeline,
  authMenu,
  studentProfile,
  openSheet,
  onOpenSheet,
  sheetPanelId,
  disabled = false,
}: VipsPageViewProps) {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null)
  const hasCompiledTruth = page.compiled_truth.trim().length > 0
  const header = PROFILE_HEADERS[dimension]
  const theme = PROFILE_THEMES[dimension]
  const claims = VIPS_TAXONOMY.filter((entry) => entry.dimension === dimension)
  const highlights = getClaimHighlights(dimension, timeline, claims)
  const visibleTimeline = selectedClaimId
    ? timeline.filter((entry) => entry.canonical_claim_id === selectedClaimId)
    : timeline
  const selectedClaim = selectedClaimId ? labelForClaim(selectedClaimId, claims) : null

  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-t-[1.75rem] bg-gradient-to-b from-[#fdfaf3] to-[#efe7d5] text-[#2b2620]"
      data-testid={`vips-page-${dimension}`}
    >
      <ProfileStudentChrome
        authMenu={authMenu}
        studentProfile={studentProfile}
        activeDimension={dimension}
        openSheet={openSheet ?? dimension}
        onOpenSheet={onOpenSheet}
        sheetPanelId={sheetPanelId}
        disabled={disabled}
      />

      <div className="mx-auto w-full max-w-[760px] px-6 py-5">
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

          <dl className="mt-5 divide-y divide-[#e3d8c4] border-y border-[#e3d8c4]">
            <div className="py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9b6b4c]">
                Most common
              </dt>
              <dd className="mt-1 text-sm text-[#5b3519]" data-testid="claim-most-common">
                {highlights.most}
              </dd>
            </div>
            <div className="py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9b6b4c]">
                Quietly emerging
              </dt>
              <dd className="mt-1 text-sm text-[#5b3519]" data-testid="claim-quietly-emerging">
                {highlights.emerging}
              </dd>
            </div>
          </dl>

          {hasCompiledTruth ? (
            <p className="mt-6 text-[15.5px] leading-relaxed" data-testid="compiled-truth">
              {page.compiled_truth}
            </p>
          ) : (
            <p
              className="mt-6 max-w-prose text-sm leading-relaxed text-[#2b2620]/60"
              data-testid="compiled-truth-empty"
            >
              No compiled truth for this dimension yet. Confirm some entries on a reflection's
              review and the page will fill in.
            </p>
          )}

          {page.open_question.trim().length > 0 ? (
            <aside
              className={cn('mt-5 rounded-[14px] p-4', theme.callout)}
              data-testid="open-question"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">
                Open question
              </p>
              <p className="mt-2 text-[14.5px] italic leading-relaxed">{page.open_question}</p>
            </aside>
          ) : null}

          {page.updated_at ? (
            <p className="mt-3 text-xs text-[#2b2620]/55" data-testid="page-updated-at">
              last refined {formatRefined(page.updated_at)}
            </p>
          ) : null}
        </header>

        <section className="pt-7" aria-labelledby={`${dimension}-collection-heading`}>
          <h2
            id={`${dimension}-collection-heading`}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55"
          >
            Collection
          </h2>
          <ul
            className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
            data-testid="profile-collection"
          >
            {claims.map((claim) => {
              const count = timeline.filter((entry) => entry.canonical_claim_id === claim.id).length
              const isSelected = selectedClaimId === claim.id
              return (
                <li key={claim.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedClaimId(isSelected ? null : claim.id)}
                    aria-pressed={isSelected}
                    data-testid={`collection-tile-${claim.id}`}
                    className={cn(
                      'flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-[14px] border border-transparent bg-white/55 px-3 py-3 text-center transition-colors',
                      'hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      isSelected && `${theme.callout} ${theme.border}`,
                      count === 0 && 'opacity-60',
                    )}
                  >
                    <span className={cn('text-sm font-semibold', theme.text)}>{claim.label}</span>
                    <span className="text-xs text-[#2b2620]/55">{formatNoticingCount(count)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="pb-14 pt-7" aria-labelledby={`${dimension}-timeline-heading`}>
          <h2
            id={`${dimension}-timeline-heading`}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55"
          >
            Timeline
            {selectedClaim ? (
              <span className={cn('ml-1 normal-case tracking-normal', theme.text)}>
                filtered to {selectedClaim}
              </span>
            ) : null}
          </h2>
          {visibleTimeline.length === 0 ? (
            <p
              className="mt-5 text-center text-sm italic text-[#2b2620]/55"
              data-testid="timeline-empty"
            >
              No timeline entries yet.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3" data-testid="timeline-list">
              {visibleTimeline.map((entry) => (
                <TimelineEntryRow
                  key={entry.id}
                  studentId={studentId}
                  entry={entry}
                  claimLabel={labelForClaim(entry.canonical_claim_id, claims)}
                  theme={theme}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}

interface TimelineEntryRowProps {
  studentId: string
  entry: VipsTimelineEntryRow
  claimLabel: string
  theme: (typeof PROFILE_THEMES)[VipsDimension]
}

function TimelineEntryRow({ studentId, entry, claimLabel, theme }: TimelineEntryRowProps) {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const forget = useMutation({
    mutationFn: () => forgetTimelineEntry({ data: { entryId: entry.id } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['vips-pages', studentId] })
      qc.invalidateQueries({ queryKey: ['vips-pages', studentId, result.dimension] })
    },
  })

  return (
    <li
      id={`entry-${entry.id}`}
      data-testid={`timeline-entry-${entry.id}`}
      className={cn(
        'scroll-mt-6 rounded-[14px] border-l-3 bg-white/60 px-4 py-3 text-sm',
        theme.border,
      )}
    >
      <blockquote className="leading-relaxed text-[#2b2620]">"{entry.verbatim_quote}"</blockquote>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#2b2620]/60">
        <span className={cn('rounded-full px-2 py-1 font-medium', theme.callout)}>
          {claimLabel}
        </span>
        <StrengthBadge strength={entry.strength} />
        {entry.reflection_id != null ? (
          <a
            href={`/library/entries/${entry.reflection_id}`}
            className={cn('ml-auto text-xs font-medium hover:underline', theme.text)}
            data-testid={`source-reflection-link-${entry.id}`}
          >
            see source reflection →
          </a>
        ) : null}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
          Details
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          {entry.parallax_tag.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {entry.parallax_tag.map((tag) => (
                <li key={tag}>
                  <Badge
                    variant="secondary"
                    size="sm"
                    radius="sm"
                    data-testid={`parallax-chip-${tag}`}
                  >
                    #{tag}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-xs text-[#2b2620]/55" data-testid="forget-inline-confirm">
                  Forget this — you can't undo
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={forget.isPending}
                  onClick={() => forget.mutate()}
                  data-testid={`forget-confirm-${entry.id}`}
                >
                  {forget.isPending ? 'Forgetting…' : 'Forget'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={forget.isPending}
                  onClick={() => setConfirming(false)}
                  data-testid={`forget-cancel-${entry.id}`}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-[#2b2620]/55 hover:text-[#2b2620]"
                onClick={() => setConfirming(true)}
                data-testid={`forget-button-${entry.id}`}
                aria-label={`Forget timeline entry ${entry.id}`}
              >
                forget
              </Button>
            )}
            {forget.isError ? (
              <span className="text-xs text-warning" role="alert">
                {forget.error instanceof Error ? forget.error.message : 'forget failed'}
              </span>
            ) : null}
          </div>
        </div>
      </details>
    </li>
  )
}

function StrengthBadge({ strength }: { strength: 'low' | 'medium' | 'high' }) {
  const cls =
    strength === 'high'
      ? 'bg-accent/15 text-accent'
      : strength === 'medium'
        ? 'bg-white/70 text-[#2b2620]'
        : 'bg-white/40 text-[#2b2620]/55'
  return (
    <Badge
      data-testid={`strength-${strength}`}
      className={cn('px-2 text-[10px] font-semibold uppercase tracking-wide', cls)}
    >
      {strength}
    </Badge>
  )
}

function getClaimHighlights(
  dimension: VipsDimension,
  timeline: VipsTimelineEntryRow[],
  claims: VipsTaxonomyEntry[],
) {
  const fallbackClaims = claims.length
    ? claims
    : VIPS_TAXONOMY.filter((entry) => entry.dimension === dimension)
  const counts = new Map<string, number>()
  for (const entry of timeline) {
    counts.set(entry.canonical_claim_id, (counts.get(entry.canonical_claim_id) ?? 0) + 1)
  }

  const ranked = fallbackClaims
    .map((claim, index) => ({
      id: claim.id,
      label: claim.label,
      count: counts.get(claim.id) ?? 0,
      index,
    }))
    .filter((claim) => claim.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)

  const most = ranked[0]
  const emerging = ranked.find((claim) => claim.id !== most?.id)

  return {
    most: most?.label ?? DIMENSION_LABEL[dimension],
    emerging: emerging?.label ?? 'Not enough signal yet',
  }
}

function labelForClaim(claimId: string, claims: VipsTaxonomyEntry[]): string {
  return (
    claims.find((claim) => claim.id === claimId)?.label ??
    VIPS_TAXONOMY.find((claim) => claim.id === claimId)?.label ??
    claimId
  )
}

function formatNoticingCount(count: number): string {
  if (count === 0) return 'no noticings yet'
  if (count === 1) return '1 noticing'
  return `${count} noticings`
}

function formatRefined(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time}`
}
