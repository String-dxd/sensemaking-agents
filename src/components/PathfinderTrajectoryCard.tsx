import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import type { PathfinderOutputRow } from '~/db/queries'

export interface PathfinderTrajectoryCardProps {
  output: PathfinderOutputRow
}

export function PathfinderTrajectoryCard({ output }: PathfinderTrajectoryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pathfinder — trajectory</CardTitle>
        <CardDescription>{new Date(output.created_at).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">{output.trajectory}</p>
        <p className="text-xs text-muted-foreground" data-testid="pathfinder-disclaimer">
          {output.disclaimer}
        </p>
      </CardContent>
    </Card>
  )
}
