import { createFileRoute, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { EngineHost } from '~/components/student-space/EngineHost'
import { EdupassLogin } from '~/components/student-space/onboarding/EdupassLogin'
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
    if (isOnboardingPath(location.pathname)) {
      try {
        return { authMenu: await loadAuthMenu() }
      } catch (err) {
        console.warn('[_app] loadAuthMenu failed on onboarding; showing sign-in fallback', err)
        return { authMenu: null }
      }
    }
    // Fail-open on auth-menu errors so a transient network failure (or a test
    // env without a server) doesn't strand the user on `/onboarding`. The
    // downstream handlers still enforce auth via `requireCounselorContext`.
    let auth: AuthMenuState
    try {
      auth = await loadAuthMenu()
    } catch (err) {
      console.warn('[_app] loadAuthMenu failed; skipping signed-out redirect', err)
      return { authMenu: null }
    }
    if (auth.status === 'signed-out') {
      throw redirect({ to: '/onboarding' })
    }
    return { authMenu: auth }
  },
  component: AppLayout,
})

type AppRouteContext = {
  authMenu?: AuthMenuState | null
}

function AppLayout() {
  const location = useLocation()
  const { authMenu } = Route.useRouteContext() as AppRouteContext

  if (isOnboardingPath(location.pathname) && authMenu?.status !== 'signed-in') {
    return (
      <EngineHost showOnboardingFlow={false} hideCompanion>
        <SignedOutOnboarding />
      </EngineHost>
    )
  }

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

export function isOnboardingPath(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/')
}

function SignedOutOnboarding() {
  return (
    <main aria-label="Sign in" className="fixed inset-0 z-50 block overflow-hidden">
      <EdupassLogin reducedMotion camera={null} />
    </main>
  )
}
