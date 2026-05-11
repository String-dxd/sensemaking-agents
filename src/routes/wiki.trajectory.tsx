import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { TrajectoryPageView } from '~/components/TrajectoryPageView'
import { Button } from '~/components/ui/button'
import { loadTrajectory } from '~/server/load-trajectory.functions'

const STUDENT_ID = 'demo'

export const Route = createFileRoute('/wiki/trajectory')({
  loader: async ({ context }) => {
    const data = await context.queryClient.ensureQueryData({
      queryKey: ['trajectory', STUDENT_ID],
      queryFn: () => loadTrajectory({ data: { studentId: STUDENT_ID } }),
    })
    // R30 carry-forward: if F1's review queue has any pending diff, F2
    // (this route) defers to the review surface. U8 wires the dedicated
    // server fn that returns the queue contents; the existence check is
    // sufficient at the loader.
    if (data.pending_diff_present) {
      throw redirect({ to: '/reflect/review' })
    }
    return data
  },
  component: WikiTrajectoryPage,
})

function WikiTrajectoryPage() {
  const { data, isPending } = useQuery({
    queryKey: ['trajectory', STUDENT_ID],
    queryFn: () => loadTrajectory({ data: { studentId: STUDENT_ID } }),
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>

  if (!data?.trajectory) {
    return (
      <section className="flex flex-col gap-4 py-6">
        <Link to="/wiki" className="text-xs text-muted-foreground hover:text-foreground">
          ← Wiki
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Trajectory</h1>
        <p className="text-sm text-muted-foreground">Run sense-making to see your trajectory.</p>
        <Link to="/wiki">
          <Button size="sm" variant="outline">
            Back to wiki
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
      <Link to="/wiki" className="text-xs text-muted-foreground hover:text-foreground">
        ← Wiki
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
