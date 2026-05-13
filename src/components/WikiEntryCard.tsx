import { Link } from '@tanstack/react-router'
import { MirrorReflectionSections } from '~/components/MirrorReflectionSections'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
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
    <Card>
      <CardHeader>
        <CardTitle>
          <Link
            to="/library/entries/$entryId"
            params={{ entryId: String(entry.id) }}
            className="hover:underline"
          >
            Reflection #{entry.id}
          </Link>
        </CardTitle>
        <CardDescription>{new Date(entry.created_at).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
      </CardContent>
    </Card>
  )
}
