import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import type { PathfinderOutputRow } from '~/db/queries'

export interface PathfinderPathwaysCardProps {
  output: PathfinderOutputRow
}

export function PathfinderPathwaysCard({ output }: PathfinderPathwaysCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pathfinder — pathways</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {output.pathways.map((p) => (
            <li key={p.label} className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-sm leading-relaxed">{p.reasoning}</p>
              <ul className="flex flex-wrap gap-1.5">
                {p.ecg_taxonomy_ids.map((id) => (
                  <li key={id}>
                    <Badge variant="secondary" size="sm" radius="sm">
                      {id}
                    </Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
