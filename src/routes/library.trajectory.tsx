import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { TrajectoryPageView } from '~/components/TrajectoryPageView'
import { Button } from '~/components/ui/button'
import { loadTrajectory } from '~/server/load-trajectory.functions'

const STUDENT_ID = 'me'

export const Route = createFileRoute('/library/trajectory')({
  loader: async ({ context }) => {
    const data = await context.queryClient.ensureQueryData({
      queryKey: ['trajectory', STUDENT_ID],
      queryFn: () => loadTrajectory({ data: {} }),
    })
    return data
  },
  component: WikiTrajectoryPage,
})

function WikiTrajectoryPage() {
  const { data, isPending } = useQuery({
    queryKey: ['trajectory', STUDENT_ID],
    queryFn: () => loadTrajectory({ data: {} }),
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>

  if (!data?.trajectory) {
    return (
      <section className="flex flex-col gap-4 py-6">
        <Link to="/library" className="text-xs text-muted-foreground hover:text-foreground">
          ← Library
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Trajectory</h1>
        <p className="text-sm text-muted-foreground">Run sense-making to see your trajectory.</p>
        <Link to="/library">
          <Button size="sm" variant="outline">
            Back to library
          </Button>
        </Link>
      </section>
    )
  }

  // The DB row's `CartographerPathway` type now mirrors the v0.2 lead-sheet
  // shape (Finding #8), so pathways pass through directly.
  const pathways = data.trajectory.pathways

  return (
    <section className="flex flex-col gap-6 py-6">
      <Link to="/library" className="text-xs text-muted-foreground hover:text-foreground">
        ← Library
      </Link>
      <TrajectoryPageView
        trajectoryParagraph={data.trajectory.trajectory_text}
        pathways={pathways}
        openQuestions={data.trajectory.open_questions}
        disclaimer={data.trajectory.disclaimer}
        createdAt={data.trajectory.created_at}
      />
    </section>
  )
}
