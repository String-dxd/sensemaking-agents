import { useQuery } from '@tanstack/react-query'
import { TrajectoryPageView } from '~/components/TrajectoryPageView'
import { loadTrajectory } from '~/server/load-trajectory.functions'

export interface TrajectorySheetViewProps {
  studentId: string
}

export function TrajectorySheetView({ studentId }: TrajectorySheetViewProps) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['trajectory', studentId],
    // studentId is server-resolved via WorkOS post managed-agents migration;
    // it stays as a queryKey member so per-student caching still works.
    queryFn: () => loadTrajectory({ data: {} }),
  })

  return (
    <section className="flex flex-col gap-4 py-2" data-testid="trajectory-sheet">
      {isPending ? (
        <p
          className="border-t border-border/70 pt-4 text-sm text-muted-foreground"
          data-testid="trajectory-sheet-loading"
        >
          loading trajectory…
        </p>
      ) : isError ? (
        <p
          className="border-t border-border/70 pt-4 text-sm text-muted-foreground"
          data-testid="trajectory-sheet-error"
        >
          {error instanceof Error
            ? "Couldn't load this page — try closing and reopening."
            : "Couldn't load this page — try closing and reopening."}
        </p>
      ) : !data?.trajectory ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 border-t border-border/70 pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Trajectory
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">No compass yet</h2>
          <p
            className="max-w-prose text-sm text-muted-foreground"
            data-testid="trajectory-sheet-empty"
          >
            Run sense-making to see your trajectory.
          </p>
        </div>
      ) : (
        <TrajectoryPageView
          trajectoryParagraph={data.trajectory.trajectory_text}
          pathways={data.trajectory.pathways}
          openQuestions={data.trajectory.open_questions}
          disclaimer={data.trajectory.disclaimer}
          createdAt={data.trajectory.created_at}
        />
      )}
    </section>
  )
}
