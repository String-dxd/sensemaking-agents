import { createFileRoute } from '@tanstack/react-router'

// `/trajectory` — opens the Path Finder (Trajectory) sheet. The engine
// host defers the open call until the backend snapshot resolves so the
// student never sees an empty trajectory shell (see
// `SURFACES_REQUIRING_HYDRATION` in `StudentSpaceHost.tsx`).
export const Route = createFileRoute('/trajectory')({
  component: TrajectoryPage,
})

function TrajectoryPage() {
  return null
}
