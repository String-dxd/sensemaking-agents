import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { loadTrajectory } from '~/server/load-trajectory.functions'

export interface TrajectorySheetViewProps {
  studentId: string
}

/**
 * Slim trajectory sheet content — the compiled trajectory paragraph plus
 * a "see full trajectory →" link to the dedicated route. The full
 * pathways + open-question cards stay on `/library/trajectory`; the sheet
 * is a launchpad, not a container, to avoid sheet height blowing up.
 */
export function TrajectorySheetView({ studentId }: TrajectorySheetViewProps) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['trajectory', studentId],
    // studentId is server-resolved via WorkOS post managed-agents migration;
    // it stays as a queryKey member so per-student caching still works.
    queryFn: () => loadTrajectory({ data: {} }),
  })

  return (
    <section className="flex flex-col gap-4 py-2" data-testid="trajectory-sheet">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Trajectory</h2>
      </header>
      {isPending ? (
        <p className="text-sm text-muted-foreground" data-testid="trajectory-sheet-loading">
          loading trajectory…
        </p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground" data-testid="trajectory-sheet-error">
          {error instanceof Error
            ? "Couldn't load this page — try closing and reopening."
            : "Couldn't load this page — try closing and reopening."}
        </p>
      ) : !data?.trajectory ? (
        <p className="text-sm text-muted-foreground" data-testid="trajectory-sheet-empty">
          Run sense-making to see your trajectory.
        </p>
      ) : (
        <p className="max-w-prose text-sm leading-relaxed" data-testid="trajectory-sheet-paragraph">
          {data.trajectory.trajectory_text}
        </p>
      )}
      <Link
        to="/library/trajectory"
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        data-testid="trajectory-sheet-link"
      >
        see full trajectory →
      </Link>
    </section>
  )
}
