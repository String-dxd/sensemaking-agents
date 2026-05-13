import type { CartographerPathwayDraft } from '~/agents/schemas'
import { Badge, badgeVariants } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import type { VipsDimension } from '~/data/vips-taxonomy'
import { cn } from '~/lib/utils'

/**
 * v0.2 (U11) — Trajectory page view. Renders the Cartographer's
 * lead-sheet output: a one-paragraph trajectory, 2–5 pathway cards
 * (label + trait_combination chips + ecg_region_tag chips +
 * risks/tradeoffs paragraph + exploration prompt), an open-questions
 * list, and a disclaimer.
 *
 * Trait_combination chips link back to `/library/$entryId` so the student can
 * click any cited claim into its source reflection. ECG region tag chips
 * are inert badges in v0.2 (a future iteration may wire them to a
 * `lookup-ecg-taxonomy` modal — out of scope for U11 to avoid scope creep
 * while U8's review surface is in flight).
 */
export interface TrajectoryPageViewProps {
  trajectoryParagraph: string
  pathways: CartographerPathwayDraft[]
  openQuestions: string[]
  disclaimer: string
  /** ISO timestamp of when this Trajectory was generated; rendered in the header. */
  createdAt?: string
  warnings?: string[]
}

export function TrajectoryPageView({
  trajectoryParagraph,
  pathways,
  openQuestions,
  disclaimer,
  createdAt,
  warnings,
}: TrajectoryPageViewProps) {
  return (
    <section className="flex flex-col gap-6" data-testid="trajectory-page">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Trajectory</h1>
        {createdAt ? (
          <p className="text-xs text-muted-foreground">
            generated {new Date(createdAt).toLocaleString()}
          </p>
        ) : null}
        <p className="max-w-prose text-sm leading-relaxed" data-testid="trajectory-paragraph">
          {trajectoryParagraph}
        </p>
      </header>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Pathways
      </h2>
      <div className="flex flex-col gap-4">
        {pathways.map((pathway) => (
          <PathwayCard key={pathway.label} pathway={pathway} />
        ))}
      </div>

      {openQuestions.length > 0 ? (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Open questions
          </h2>
          <ul className="flex flex-col gap-1.5 text-sm" data-testid="trajectory-open-questions">
            {openQuestions.map((q) => (
              <li key={q} className="leading-relaxed">
                · {q}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p
        className="max-w-prose text-xs italic text-muted-foreground"
        data-testid="trajectory-disclaimer"
      >
        {disclaimer}
      </p>

      {warnings && warnings.length > 0 ? (
        <details
          className="rounded border border-border/40 bg-muted/20 p-3 text-xs"
          data-testid="trajectory-warnings"
        >
          <summary className="cursor-pointer text-muted-foreground">
            {warnings.length} pathway{warnings.length === 1 ? '' : 's'} dropped during validation
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {warnings.map((w) => (
              <li key={w} className="leading-relaxed text-muted-foreground">
                · {w}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}

function PathwayCard({ pathway }: { pathway: CartographerPathwayDraft }) {
  return (
    <Card data-testid={`pathway-card-${slugify(pathway.label)}`}>
      <CardHeader>
        <CardTitle>{pathway.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Trait combination
          </p>
          <ul className="flex flex-wrap gap-1.5 text-[11px]" data-testid="trait-combination-chips">
            {pathway.trait_combination.map((c) => (
              <li key={`${c.dimension}-${c.claim_id}-${c.timeline_entry_id ?? 'none'}`}>
                <TraitChip
                  claimId={c.claim_id}
                  dimension={c.dimension}
                  timelineEntryId={c.timeline_entry_id}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">ECG region tags</p>
          <ul className="flex flex-wrap gap-1.5" data-testid="ecg-region-tag-chips">
            {pathway.ecg_region_tags.map((id) => (
              <li key={id}>
                <Badge variant="secondary" size="sm" radius="sm" data-testid={`ecg-tag-${id}`}>
                  {id}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Risks and tradeoffs
          </p>
          <p className="text-sm leading-relaxed">{pathway.risks_tradeoffs}</p>
        </div>

        <div
          className="rounded border-l-2 border-accent/60 bg-accent/5 px-3 py-2"
          data-testid="exploration-prompt"
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Explore next</p>
          <p className="text-sm leading-relaxed">{pathway.exploration_prompt}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function TraitChip({
  claimId,
  dimension,
  timelineEntryId,
}: {
  claimId: string
  dimension: VipsDimension
  timelineEntryId?: number
}) {
  // Per the plan, trait_combination chips link back to the source VIPS
  // page. The `/library/$dimension` and the per-timeline-entry anchor are U9's
  // surface (they're not yet routed today); we encode the link target in
  // attributes so U9 can wire them without a TrajectoryPageView edit.
  const href = `/library/${dimension}${timelineEntryId ? `#entry-${timelineEntryId}` : ''}`
  // TanStack `<Link>` doesn't validate dynamic dimension paths against the
  // registered route tree, so we use a regular anchor to avoid a typegen
  // dependency. U9 will tighten this once `/library/$dimension` is in the
  // router tree.
  return (
    <a
      href={href}
      data-testid={`trait-chip-${claimId}`}
      data-dimension={dimension}
      data-timeline-entry-id={timelineEntryId ?? ''}
      className={cn(
        badgeVariants({ variant: 'secondary', size: 'sm', radius: 'sm' }),
        'hover:bg-muted/80 hover:text-foreground',
      )}
    >
      {claimId}
    </a>
  )
}

// Stable test-friendly slug from a free-text label.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
