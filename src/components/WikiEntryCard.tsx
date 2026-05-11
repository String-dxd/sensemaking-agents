import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import type { MirrorEntryRow } from '~/db/queries'

export interface WikiEntryCardProps {
  entry: MirrorEntryRow
}

/**
 * Quiet-mirror reflection card. Shows the three editable fields produced by
 * the Mirror agent in narrative order: story (the reframe), what Mirror
 * heard (validation), and what it suspects you meant (inferred meaning).
 */
export function WikiEntryCard({ entry }: WikiEntryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link
            to="/library/$entryId"
            params={{ entryId: String(entry.id) }}
            className="hover:underline"
          >
            Reflection #{entry.id}
          </Link>
        </CardTitle>
        <CardDescription>{new Date(entry.created_at).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed" data-testid="story-reframe">
          {entry.story_reframe}
        </p>
        <div className="flex flex-col gap-2 rounded border border-border/40 bg-muted/30 p-3">
          <FieldBlock label="Validation" value={entry.validation} testId="validation" />
          <FieldBlock
            label="Inferred meaning"
            value={entry.inferred_meaning}
            testId="inferred-meaning"
          />
        </div>
        {entry.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {entry.tags.map((t) => (
              <li key={t} className="rounded bg-muted px-1.5 py-0.5">
                #{t}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

function FieldBlock({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <p className="text-xs leading-relaxed" data-testid={testId}>
      <span className="font-medium text-muted-foreground">{label}:</span>{' '}
      <span className="text-foreground">{value}</span>
    </p>
  )
}
