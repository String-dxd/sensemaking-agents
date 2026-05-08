import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import type { MirrorEntryRow } from '~/db/queries'

const KIND_LABEL: Record<MirrorEntryRow['signals'][number]['kind'], string> = {
  observed: 'observed',
  inferred: 'inferred',
  uncertain: 'uncertain',
}

const KIND_TONE: Record<MirrorEntryRow['signals'][number]['kind'], string> = {
  observed: 'bg-muted text-foreground',
  inferred: 'bg-accent/10 text-accent',
  uncertain: 'bg-warning/15 text-warning',
}

export interface WikiEntryCardProps {
  entry: MirrorEntryRow
}

export function WikiEntryCard({ entry }: WikiEntryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link
            to="/wiki/$entryId"
            params={{ entryId: String(entry.id) }}
            className="hover:underline"
          >
            Reflection #{entry.id}
          </Link>
        </CardTitle>
        <CardDescription>{new Date(entry.created_at).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">{entry.summary}</p>
        {entry.signals.length > 0 ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {entry.signals.map((s) => (
              <li
                key={`${s.kind}:${s.text}`}
                className="flex items-start gap-2"
                data-signal-kind={s.kind}
              >
                <span
                  className={`mt-0.5 inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${KIND_TONE[s.kind]}`}
                >
                  {KIND_LABEL[s.kind]}
                </span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {entry.caution ? (
          <p
            className="rounded border border-warning/30 bg-warning/10 p-2 text-xs text-warning"
            data-testid="mirror-caution"
          >
            <span className="font-medium">caution:</span> {entry.caution}
          </p>
        ) : null}
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
