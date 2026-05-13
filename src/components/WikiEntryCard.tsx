import { Link } from '@tanstack/react-router'
import { MirrorReflectionSections } from '~/components/MirrorReflectionSections'
import { Badge } from '~/components/ui/badge'
import type { MirrorEntryRow } from '~/db/queries'

export interface WikiEntryCardProps {
  entry: MirrorEntryRow
}

/**
 * Quiet-mirror reflection card. Shows the three editable fields produced by
 * the Mirror agent as distinct lenses: validation, inferred meaning, and
 * story reframe.
 */
export function WikiEntryCard({ entry }: WikiEntryCardProps) {
  return (
    <article className="flex flex-col gap-5 border-b border-border/70 pb-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Reflection
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          <Link
            to="/library/entries/$entryId"
            params={{ entryId: String(entry.id) }}
            className="hover:underline"
          >
            Reflection #{entry.id}
          </Link>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(entry.created_at).toLocaleString()}
        </p>
      </header>
      <div className="flex flex-col gap-4">
        <MirrorReflectionSections entry={entry} />
        {entry.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {entry.tags.map((t) => (
              <li key={t}>
                <Badge variant="secondary" size="sm" radius="sm">
                  #{t}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  )
}
