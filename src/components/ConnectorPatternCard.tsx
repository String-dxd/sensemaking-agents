import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import type { ConnectorOutputRow } from '~/db/queries'

const STRENGTH_TONE: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-accent/10 text-accent',
  high: 'bg-accent/20 text-accent',
}

export interface ConnectorPatternCardProps {
  output: ConnectorOutputRow
}

export function ConnectorPatternCard({ output }: ConnectorPatternCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connector — patterns from your reflections</CardTitle>
        <CardDescription>{new Date(output.created_at).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {output.patterns.map((p) => (
            <li key={p.text} className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <Badge
                  size="sm"
                  radius="sm"
                  className={`mt-0.5 shrink-0 text-[10px] tracking-wide ${STRENGTH_TONE[p.strength]}`}
                >
                  {p.strength}
                </Badge>
                <p className="text-sm leading-relaxed">{p.text}</p>
              </div>
              <p className="pl-9 text-xs text-muted-foreground">
                evidence: reflections {p.evidence_reflection_ids.map((id) => `#${id}`).join(', ')}
              </p>
            </li>
          ))}
        </ul>
        {output.still_unclear ? (
          <p
            className="rounded border border-border bg-muted/40 p-2 text-xs"
            data-testid="connector-still-unclear"
          >
            <span className="font-medium text-muted-foreground">still unclear:</span>{' '}
            {output.still_unclear}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
