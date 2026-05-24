import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { EngineHost } from '~/components/student-space/EngineHost'
import { loadAuthMenu } from '~/server/auth-menu.functions'
import type { AuthMenuState } from '~/server/auth-menu.handler.server'

// Pathless layout for the student-space app shell. Every route nested under
// `_app` (the home world, `/profile`, `/history`, `/letters`, `/trajectory`,
// `/settings`, `/onboarding`) renders inside the engine host so the WebGL
// canvas, SideRail, and OnboardingFlow persist across navigations.
//
// Dev tooling routes (`/dev/*`) live under `_dev` instead and do NOT mount
// the engine — see `src/routes/_dev.tsx`.
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    // `/onboarding` carries the sign-in surface itself — never bounce signed-
    // out users away from it, or they can never reach the login buttons.
    if (location.pathname === '/onboarding' || location.pathname.startsWith('/onboarding/')) {
      return
    }
    // Fail-open on auth-menu errors so a transient network failure (or a test
    // env without a server) doesn't strand the user on `/onboarding`. The
    // downstream handlers still enforce auth via `requireCounselorContext`.
    let auth: AuthMenuState
    try {
      auth = await loadAuthMenu()
    } catch (err) {
      console.warn('[_app] loadAuthMenu failed; skipping signed-out redirect', err)
      return
    }
    if (auth.status === 'signed-out') {
      throw redirect({ to: '/onboarding' })
    }
  },
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
