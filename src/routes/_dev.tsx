import { createFileRoute, Outlet } from '@tanstack/react-router'

// Pathless layout for dev tooling routes (`/dev/*`). These pages render their
// own admin/QA chrome and must NOT mount the student-space engine — no
// SideRail, no Three.js canvas, no onboarding ceremony. Keep this layout
// thin: a max-width centered container is enough for the existing dev pages.
//
// Student-space routes live under `_app` instead — see `src/routes/_app.tsx`.
export const Route = createFileRoute('/_dev')({
  component: DevLayout,
})

function DevLayout() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
      <Outlet />
    </div>
  )
}
