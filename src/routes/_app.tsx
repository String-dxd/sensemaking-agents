import { createFileRoute, Outlet } from '@tanstack/react-router'
import { EngineHost } from '~/components/student-space/EngineHost'

// Pathless layout for the student-space app shell. Every route nested under
// `_app` (the home world, `/profile`, `/history`, `/letters`, `/trajectory`,
// `/settings`, `/onboarding`) renders inside the engine host so the WebGL
// canvas, SideRail, and OnboardingFlow persist across navigations.
//
// Dev tooling routes (`/dev/*`) live under `_dev` instead and do NOT mount
// the engine — see `src/routes/_dev.tsx`.
export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  return (
    <EngineHost>
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <main className="flex min-h-0 w-full flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </EngineHost>
  )
}
