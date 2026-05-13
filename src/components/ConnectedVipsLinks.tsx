import { Link } from '@tanstack/react-router'
import { Badge } from '~/components/ui/badge'
import type { VipsDimension } from '~/data/vips-taxonomy'
import type { VipsTimelineEntryRow } from '~/db/queries'

const DIMENSION_LABEL: Record<VipsDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

const DIMENSION_ORDER: VipsDimension[] = ['values', 'interests', 'personality', 'skills']

export interface ConnectedVipsLinksProps {
  entries: VipsTimelineEntryRow[]
}

export function ConnectedVipsLinks({ entries }: ConnectedVipsLinksProps) {
  if (entries.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded border border-border/40 bg-muted/10 p-3">
        <h2 className="text-sm font-semibold">Connected VIPS entries</h2>
        <p className="text-sm text-muted-foreground">
          No connected VIPS entries yet. Run Connector from Library when you want this reflection
          linked into the VIPS pages.
        </p>
        <Link to="/library" className="w-fit text-xs text-muted-foreground hover:text-foreground">
          Back to Library
        </Link>
      </section>
    )
  }

  const byDimension = groupByDimension(entries)

  return (
    <section className="flex flex-col gap-4" data-testid="connected-vips-links">
      <h2 className="text-sm font-semibold">Connected VIPS entries</h2>
      {DIMENSION_ORDER.map((dimension) => {
        const dimensionEntries = byDimension.get(dimension) ?? []
        if (dimensionEntries.length === 0) return null
        return (
          <div key={dimension} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {DIMENSION_LABEL[dimension]}
              </h3>
              <Link
                to="/library/$dimension"
                params={{ dimension }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Open page
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {dimensionEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 rounded border border-border/40 bg-background p-3"
                  data-testid={`connected-vips-entry-${entry.id}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" size="sm" radius="sm">
                      {entry.canonical_claim_id}
                    </Badge>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {entry.strength}
                    </span>
                    {entry.parallax_tag.map((tag) => (
                      <Badge key={tag} variant="outline" size="sm" radius="sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed">"{entry.verbatim_quote}"</p>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

function groupByDimension(
  entries: VipsTimelineEntryRow[],
): Map<VipsDimension, VipsTimelineEntryRow[]> {
  const out = new Map<VipsDimension, VipsTimelineEntryRow[]>()
  for (const entry of entries) {
    if (!isVipsDimension(entry.dimension)) continue
    const existing = out.get(entry.dimension) ?? []
    existing.push(entry)
    out.set(entry.dimension, existing)
  }
  return out
}

function isVipsDimension(value: string): value is VipsDimension {
  return (DIMENSION_ORDER as readonly string[]).includes(value)
}
