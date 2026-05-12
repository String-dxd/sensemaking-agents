/**
 * U9 — Renders one VIPS dimension's wiki page. Single read-only surface
 * with one mutation: per-entry forget (R3).
 *
 * Layout:
 *   - Header: dimension label + compiled_truth paragraph + "Open question:" line
 *   - Body: chronological timeline (newest first), one card per entry
 *     · verbatim block-quote
 *     · "see source reflection" link to /library/$reflection_id
 *     · strength badge (low / medium / high)
 *     · parallax tag chips
 *     · small unobtrusive forget icon button → inline confirm
 *
 * Voice calibration (R29): a `dimension` prop varies the compiled-truth
 * paragraph's typographic restraint — no new fonts, no new colors, just
 * different leading / weight per dimension so the four pages don't read
 * with identical visual rhythm. Behavior is identical across dimensions.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import type { VipsDimension } from '~/data/vips-taxonomy'
import type { VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'
import { forgetTimelineEntry } from '~/server/forget-timeline-entry.functions'

const DIMENSION_LABEL: Record<VipsDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

/**
 * R29 voice calibration via tailwind restraint. The four dimensions share
 * one font and one palette; only paragraph treatment varies so the pages
 * don't visually rhyme. Values is the most assertive; Interests slightly
 * looser leading; Personality lightest weight (no diagnostic emphasis);
 * Skills slightly tighter leading + monospace-adjacent restraint.
 */
const DIMENSION_COMPILED_TRUTH_CLASS: Record<VipsDimension, string> = {
  values: 'text-base font-medium leading-relaxed',
  interests: 'text-base font-normal leading-loose',
  personality: 'text-base font-light leading-relaxed',
  skills: 'text-base font-normal leading-snug',
}

export interface VipsPageViewProps {
  studentId: string
  dimension: VipsDimension
  page: VipsPageRow
  timeline: VipsTimelineEntryRow[]
}

export function VipsPageView({ studentId, dimension, page, timeline }: VipsPageViewProps) {
  const hasCompiledTruth = page.compiled_truth.trim().length > 0
  return (
    <section className="flex flex-col gap-6 py-6" data-testid={`vips-page-${dimension}`}>
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{DIMENSION_LABEL[dimension]}</h1>
        {hasCompiledTruth ? (
          <p
            className={`max-w-prose ${DIMENSION_COMPILED_TRUTH_CLASS[dimension]}`}
            data-testid="compiled-truth"
          >
            {page.compiled_truth}
          </p>
        ) : (
          <p
            className="max-w-prose text-sm text-muted-foreground"
            data-testid="compiled-truth-empty"
          >
            No compiled truth for this dimension yet. Confirm some entries on a reflection's review
            and the page will fill in.
          </p>
        )}
        {page.open_question.trim().length > 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground" data-testid="open-question">
            <span className="font-medium">Open question:</span> {page.open_question}
          </p>
        ) : null}
        {page.updated_at ? (
          <p className="text-xs text-muted-foreground" data-testid="page-updated-at">
            last refined {new Date(page.updated_at).toLocaleString()}
          </p>
        ) : null}
      </header>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Timeline
      </h2>
      {timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="timeline-empty">
          No timeline entries yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="timeline-list">
          {timeline.map((entry) => (
            <TimelineEntryRow key={entry.id} studentId={studentId} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  )
}

interface TimelineEntryRowProps {
  studentId: string
  entry: VipsTimelineEntryRow
}

function TimelineEntryRow({ studentId, entry }: TimelineEntryRowProps) {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const forget = useMutation({
    mutationFn: () => forgetTimelineEntry({ data: { entryId: entry.id } }),
    onSuccess: (result) => {
      // Invalidate both the overview's umbrella key and the dimension-scoped
      // page key so a forget on `/library/$dimension` immediately removes the
      // entry, and a subsequent navigation to `/wiki` shows the new claim
      // count.
      qc.invalidateQueries({ queryKey: ['vips-pages', studentId] })
      qc.invalidateQueries({ queryKey: ['vips-pages', studentId, result.dimension] })
    },
  })

  return (
    <li
      id={`entry-${entry.id}`}
      data-testid={`timeline-entry-${entry.id}`}
      className="flex flex-col gap-2 rounded border border-border/40 bg-background/40 p-3 text-sm"
    >
      <blockquote className="border-l-2 border-border/60 pl-3 italic leading-relaxed">
        “{entry.verbatim_quote}”
      </blockquote>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <StrengthBadge strength={entry.strength} />
        {entry.parallax_tag.map((tag) => (
          <span
            key={tag}
            className="rounded bg-muted px-1.5 py-0.5"
            data-testid={`parallax-chip-${tag}`}
          >
            #{tag}
          </span>
        ))}
        {entry.reflection_id != null ? (
          // Plain `<a>` rather than TanStack `<Link>` because `/library/$entryId`
          // requires a typegen-validated params object and this surface also
          // renders inside test wrappers that don't always mount a router.
          // Mirrors `TrajectoryPageView`'s trait-chip pattern for the same
          // reason.
          <a
            href={`/library/${entry.reflection_id}`}
            className="ml-auto text-xs hover:text-foreground hover:underline"
            data-testid={`source-reflection-link-${entry.id}`}
          >
            see source reflection →
          </a>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-muted-foreground" data-testid="forget-inline-confirm">
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
            // Small unobtrusive affordance — text-only "forget", muted, no
            // border. The plan calls for a "small unobtrusive forget icon
            // button"; we use a glyph-prefixed text button to avoid pulling
            // in an icon dependency for one button.
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setConfirming(true)}
            data-testid={`forget-button-${entry.id}`}
            aria-label={`Forget timeline entry ${entry.id}`}
          >
            ⌫ forget
          </Button>
        )}
        {forget.isError ? (
          <span className="text-xs text-warning" role="alert">
            {forget.error instanceof Error ? forget.error.message : 'forget failed'}
          </span>
        ) : null}
      </div>
    </li>
  )
}

function StrengthBadge({ strength }: { strength: 'low' | 'medium' | 'high' }) {
  // Three different background opacities — no new color tokens. Restraint:
  // the badge is informational, never decorative.
  const cls =
    strength === 'high'
      ? 'bg-accent/15 text-accent'
      : strength === 'medium'
        ? 'bg-muted text-foreground'
        : 'bg-muted/40 text-muted-foreground'
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
      data-testid={`strength-${strength}`}
    >
      {strength}
    </span>
  )
}
