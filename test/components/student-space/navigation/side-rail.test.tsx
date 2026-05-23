import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactElement, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SideRail } from '~/components/student-space/navigation/SideRail'
import { EngineOverlayProvider, useEngineOverlay } from '~/lib/student-space/use-engine-overlay'

const routeSyncMock = vi.hoisted(() => ({
  navigateOverride: null as null | ((href: string) => void),
}))

vi.mock('~/lib/student-space/route-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/student-space/route-sync')>()
  const routerModule =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')

  return {
    ...actual,
    useStudentSpaceNavigate: () => {
      const router = routerModule.useRouter()
      return (href: string) => {
        if (routeSyncMock.navigateOverride) {
          routeSyncMock.navigateOverride(href)
          return
        }
        const [pathname, hashRaw] = href.split('#')
        const hash = hashRaw || undefined
        void router.navigate({
          to: pathname as unknown as Parameters<typeof router.navigate>[0]['to'],
          ...(hash ? { hash } : {}),
        })
      }
    },
  }
})

function renderRailAt(pathname: string, element: ReactElement = <SideRail game={makeGame()} />) {
  const rootRoute = createRootRoute({
    component: () => (
      <EngineOverlayProvider>
        <Outlet />
      </EngineOverlayProvider>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => element,
  })
  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => element,
  })
  const routeTree = rootRoute.addChildren([indexRoute, catchAllRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  return { router, ...render(<RouterProvider router={router} />) }
}

function makeGame() {
  return {
    state: {
      onboarding: { reset: vi.fn() },
      persistence: { flush: vi.fn() },
    },
  }
}

function HiddenDuringOnboarding() {
  const overlay = useEngineOverlay()
  useEffect(() => {
    overlay.setIsOnboarding(true)
    return () => overlay.setIsOnboarding(false)
  }, [overlay])
  return <SideRail game={makeGame()} />
}

afterEach(() => {
  routeSyncMock.navigateOverride = null
  document.body.className = ''
  window.location.hash = ''
})

describe('SideRail', () => {
  it.each([
    ['Letters', '/letters'],
    ['History', '/history'],
    ['Profile', '/profile'],
    ['Path Finder', '/trajectory'],
  ])('marks %s active immediately while routed navigation is pending', async (label, expectedPathname) => {
    const user = userEvent.setup()
    routeSyncMock.navigateOverride = vi.fn()
    const { router } = renderRailAt('/')
    const islandButton = await screen.findByRole('button', { name: 'Island' })
    const targetButton = await screen.findByRole('button', { name: label })

    expect(islandButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(targetButton)

    expect(routeSyncMock.navigateOverride).toHaveBeenCalledWith(expectedPathname)
    expect(router.state.location.pathname).toBe('/')
    expect(targetButton).toHaveAttribute('aria-pressed', 'true')
    expect(islandButton).toHaveAttribute('aria-pressed', 'false')
  })

  it.each([
    ['Profile', '/profile'],
    ['Letters', '/letters'],
    ['Path Finder', '/trajectory'],
    ['History', '/history'],
    ['Settings', '/settings'],
    ['Island', '/'],
  ])('navigates to %s through the router', async (label, expectedPathname) => {
    const user = userEvent.setup()
    const { router } = renderRailAt('/')
    const button = await screen.findByRole('button', { name: label })

    await user.click(button)

    await waitFor(() => expect(router.state.location.pathname).toBe(expectedPathname))
  })

  it('active routed-page buttons stay on routed pages instead of closing to the island', async () => {
    const user = userEvent.setup()
    const { router } = renderRailAt('/history/growth')
    const historyButton = await screen.findByRole('button', { name: 'History' })

    await user.click(historyButton)

    await waitFor(() => expect(router.state.location.pathname).toBe('/history'))
  })

  it('Settings lives in the bottom group alongside Letters', async () => {
    renderRailAt('/')
    const nav = await screen.findByRole('navigation', { name: 'World navigation' })
    const groups = Array.from(nav.children) as HTMLElement[]
    const topGroup = groups[0]
    const bottomGroup = groups[1]
    if (!topGroup || !bottomGroup) throw new Error('SideRail should render two button groups')

    const labelsIn = (group: HTMLElement) =>
      Array.from(group.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))

    expect(labelsIn(topGroup)).toEqual(['Island', 'History', 'Profile', 'Path Finder'])
    expect(labelsIn(bottomGroup)).toEqual(['Letters', 'Settings'])
  })

  it('hides while onboarding owns the world route', () => {
    renderRailAt('/', <HiddenDuringOnboarding />)

    return waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'World navigation' }),
      ).not.toBeInTheDocument(),
    )
  })
})
