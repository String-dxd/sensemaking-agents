import type { CartographerPathwayDraft } from '~/agents/schemas'
import { Badge, badgeVariants } from '~/components/ui/badge'
import type { VipsDimension } from '~/data/vips-taxonomy'
import { cn } from '~/lib/utils'

/**
 * v0.2 (U11) — Trajectory page view. Renders the Cartographer's
 * lead-sheet output: a one-paragraph trajectory, 2–5 pathway cards
 * (label + trait_combination chips + ecg_region_tag chips +
 * risks/tradeoffs paragraph + exploration prompt), an open-questions
 * list, and a disclaimer.
 *
 * Trait_combination chips link back to `/library/entries/$entryId` so the student can
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
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-7" data-testid="trajectory-page">
      <header className="grid gap-5 border-b border-border/70 pb-6 md:grid-cols-[minmax(0,1fr)_16rem] md:items-end">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Trajectory
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Trajectory compass</h1>
          <p
            className="max-w-3xl text-base leading-7 text-foreground sm:text-lg sm:leading-8"
            data-testid="trajectory-paragraph"
          >
            {trajectoryParagraph}
          </p>
        </div>
        <dl className="grid gap-3 border-t border-border/70 pt-4 text-sm md:border-t-0 md:pt-0">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Generated</dt>
            <dd className="mt-1 text-foreground">
              {createdAt ? new Date(createdAt).toLocaleString() : 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Bearings</dt>
            <dd className="mt-1 text-foreground">
              {pathways.length} pathway{pathways.length === 1 ? '' : 's'}
            </dd>
          </div>
        </dl>
      </header>

      <section className="grid gap-7 md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
        <CompassBearingMap pathways={pathways} />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Pathways
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              Exploration prompts are the near-term next steps; evidence and tradeoffs stay with
              each bearing.
            </p>
          </div>
          <ol className="flex flex-col" data-testid="trajectory-pathways">
            {pathways.map((pathway, index) => (
              <PathwayCard key={pathway.label} pathway={pathway} index={index} />
            ))}
          </ol>
        </div>
      </section>

      {openQuestions.length > 0 ? (
        <details className="border-t border-border/70 pt-4">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Open questions
          </summary>
          <ul
            className="mt-3 flex flex-col gap-2 text-sm leading-relaxed"
            data-testid="trajectory-open-questions"
          >
            {openQuestions.map((q) => (
              <li key={q} className="leading-relaxed">
                {q}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="border-t border-border/70 pt-4">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Guidance note
        </summary>
        <p
          className="mt-3 max-w-3xl text-xs leading-relaxed text-muted-foreground"
          data-testid="trajectory-disclaimer"
        >
          {disclaimer}
        </p>
      </details>

      {warnings && warnings.length > 0 ? (
        <details
          className="border-t border-border/70 pt-4 text-xs"
          data-testid="trajectory-warnings"
        >
          <summary className="cursor-pointer font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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

function CompassBearingMap({ pathways }: { pathways: CartographerPathwayDraft[] }) {
  const bearings = pathways.slice(0, 5)
  return (
    <section
      aria-label="Trajectory compass bearings"
      className="sticky top-6 mx-auto aspect-square w-full max-w-64 rounded-full border border-border bg-muted/20"
      data-testid="trajectory-compass"
    >
      <div className="absolute inset-5 rounded-full border border-border/70" />
      <div className="absolute inset-12 rounded-full border border-border/50" />
      <span className="absolute left-1/2 top-3 -translate-x-1/2 text-[10px] font-semibold text-muted-foreground">
        N
      </span>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-muted-foreground">
        S
      </span>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">
        W
      </span>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">
        E
      </span>
      <div className="absolute left-1/2 top-1/2 h-20 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/50" />
      <div className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 rounded-full bg-accent/60" />
      <div className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background" />
      {bearings.map((pathway, index) => {
        const angle = -90 + index * (360 / Math.max(1, bearings.length))
        const radius = 38
        const x = 50 + Math.cos((angle * Math.PI) / 180) * radius
        const y = 50 + Math.sin((angle * Math.PI) / 180) * radius
        return (
          <a
            key={pathway.label}
            href={`#pathway-${slugify(pathway.label)}`}
            className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-background bg-accent text-xs font-semibold text-accent-foreground shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ left: `${x}%`, top: `${y}%` }}
            data-testid={`compass-bearing-${slugify(pathway.label)}`}
            aria-label={`Open pathway ${pathway.label}`}
          >
            {index + 1}
          </a>
        )
      })}
    </section>
  )
}

function PathwayCard({ pathway, index }: { pathway: CartographerPathwayDraft; index: number }) {
  return (
    <li
      id={`pathway-${slugify(pathway.label)}`}
      className="scroll-mt-6 border-t border-border/70 py-5 first:border-t-0 first:pt-0"
      data-testid={`pathway-card-${slugify(pathway.label)}`}
    >
      <div className="grid gap-4 sm:grid-cols-[2.25rem_minmax(0,1fr)]">
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{pathway.label}</h3>
            <p className="mt-2 text-sm leading-relaxed" data-testid="exploration-prompt">
              {pathway.exploration_prompt}
            </p>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground group-open:text-foreground">
              Evidence and tradeoffs
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Trait combination
                </p>
                <ul
                  className="flex flex-wrap gap-1.5 text-[11px]"
                  data-testid="trait-combination-chips"
                >
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
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  ECG region tags
                </p>
                <ul className="flex flex-wrap gap-1.5" data-testid="ecg-region-tag-chips">
                  {pathway.ecg_region_tags.map((id) => (
                    <li key={id}>
                      <Badge
                        variant="secondary"
                        size="sm"
                        radius="sm"
                        data-testid={`ecg-tag-${id}`}
                      >
                        {id}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 border-l border-border/80 pl-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Risks and tradeoffs
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pathway.risks_tradeoffs}
              </p>
            </div>
          </details>
        </div>
      </div>
    </li>
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
