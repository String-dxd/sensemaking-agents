import { createFileRoute } from '@tanstack/react-router'
import { TrajectorySheet } from '~/components/student-space/sheets/TrajectorySheet'

// `/trajectory` — opens the React Path Finder (Trajectory) sheet (U5).
// EngineHost defers route-sync (paused=true) until the backend snapshot
// resolves so the student never sees an empty trajectory shell (see
// `SURFACES_REQUIRING_HYDRATION` in EngineHost.tsx).
export const Route = createFileRoute('/trajectory')({
  component: TrajectoryPage,
})

function TrajectoryPage() {
  return <TrajectorySheet />
}
