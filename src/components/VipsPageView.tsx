/**
 * U9 — Renders one VIPS dimension's wiki page. Single read-only surface
 * with one mutation: per-entry forget (R3).
 *
 * Layout:
 *   - Header: dimension label + compiled_truth paragraph + "Open question:" line
 *   - Body: chronological timeline (newest first), one card per entry
 *     · verbatim block-quote
 *     · "see source reflection" link to /library/entries/$reflection_id
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
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import type { VipsDimension } from '~/data/vips-taxonomy'
import type { VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'
import { cn } from '~/lib/utils'
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
    <section
      className="mx-auto flex w-full max-w-5xl flex-col gap-7 py-2"
      data-testid={`vips-page-${dimension}`}
    >
      <header className="grid gap-5 border-b border-border/70 pb-6 md:grid-cols-[minmax(0,1fr)_14rem] md:items-end">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Profile page
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {DIMENSION_LABEL[dimension]}
          </h1>
        </div>
        <dl className="grid gap-3 border-t border-border/70 pt-4 text-sm md:border-t-0 md:pt-0">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Entries</dt>
            <dd className="mt-1 text-foreground">{timeline.length}</dd>
          </div>
          {page.updated_at ? (
            <div data-testid="page-updated-at">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Refined</dt>
              <dd className="mt-1 text-foreground">{new Date(page.updated_at).toLocaleString()}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Current read
          </h2>
          {hasCompiledTruth ? (
            <p
              className={`max-w-3xl ${DIMENSION_COMPILED_TRUTH_CLASS[dimension]}`}
              data-testid="compiled-truth"
            >
              {page.compiled_truth}
            </p>
          ) : (
            <p
              className="max-w-prose text-sm text-muted-foreground"
              data-testid="compiled-truth-empty"
            >
              No compiled truth for this dimension yet. Confirm some entries on a reflection's
              review and the page will fill in.
            </p>
          )}
        </div>
        {hasCompiledTruth ? (
          <aside className="border-t border-border/70 pt-4 md:border-t-0 md:pt-0">
            {page.open_question.trim().length > 0 ? (
              <details open data-testid="open-question">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Open question
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {page.open_question}
                </p>
              </details>
            ) : null}
          </aside>
        ) : null}
      </section>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Timeline
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Source moments are newest first, with supporting tags and maintenance actions kept close
          to each entry.
        </p>
      </div>
      {timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="timeline-empty">
          No timeline entries yet.
        </p>
      ) : (
        <ul className="flex flex-col" data-testid="timeline-list">
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
      className="scroll-mt-6 border-t border-border/70 py-4 text-sm first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{entry.canonical_claim_id}</span>
        <StrengthBadge strength={entry.strength} />
        {entry.reflection_id != null ? (
          // Plain `<a>` rather than TanStack `<Link>` because this surface also
          // renders inside test wrappers that don't always mount a router.
          <a
            href={`/library/entries/${entry.reflection_id}`}
            className="ml-auto text-xs hover:text-foreground hover:underline"
            data-testid={`source-reflection-link-${entry.id}`}
          >
            see source reflection →
          </a>
        ) : null}
      </div>
      <blockquote className="mt-2 max-w-3xl leading-relaxed text-foreground">
        "{entry.verbatim_quote}"
      </blockquote>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
                className="text-xs text-muted-foreground hover:text-foreground"
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
  // Three different background opacities — no new color tokens. Restraint:
  // the badge is informational, never decorative.
  const cls =
    strength === 'high'
      ? 'bg-accent/15 text-accent'
      : strength === 'medium'
        ? 'bg-muted text-foreground'
        : 'bg-muted/40 text-muted-foreground'
  return (
    <Badge
      data-testid={`strength-${strength}`}
      className={cn('px-2 text-[10px] font-semibold uppercase tracking-wide', cls)}
    >
      {strength}
    </Badge>
  )
}
