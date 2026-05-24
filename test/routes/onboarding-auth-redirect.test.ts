/**
 * `_app` auth gate. The pathless `_app` layout's `beforeLoad` calls
 * `loadAuthMenu` and redirects signed-out users to `/onboarding` so the
 * sign-in surface is the only thing they can reach. `/onboarding` itself
 * is exempt — otherwise the gate would loop on the login page.
 *
 * Tests drive the router through memory history and mock `loadAuthMenu`
 * per-case to flip between the signed-in and signed-out flows.
 */
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '~/routeTree.gen'
import type { AuthMenuState } from '~/server/auth-menu.handler.server'

const loadAuthMenuMock = vi.hoisted(() => vi.fn<() => Promise<AuthMenuState>>())

vi.mock('~/server/auth-menu.functions', () => ({
  loadAuthMenu: loadAuthMenuMock,
}))

async function pathnameAfterNavigation(initial: string): Promise<string> {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  await router.load()
  return router.state.location.pathname
}

describe('_app signed-out redirect', () => {
  beforeEach(() => {
    loadAuthMenuMock.mockReset()
  })

  it('redirects to /onboarding when signed out', async () => {
    loadAuthMenuMock.mockResolvedValue({ status: 'signed-out' })
    expect(await pathnameAfterNavigation('/')).toBe('/onboarding')
    expect(await pathnameAfterNavigation('/profile')).toBe('/onboarding')
    expect(await pathnameAfterNavigation('/history')).toBe('/onboarding')
    expect(await pathnameAfterNavigation('/settings')).toBe('/onboarding')
  })

  it('does not redirect signed-in users', async () => {
    loadAuthMenuMock.mockResolvedValue({
      status: 'signed-in',
      label: 'Test',
      detail: null,
      kind: 'demo',
    })
    expect(await pathnameAfterNavigation('/')).toBe('/')
    expect(await pathnameAfterNavigation('/profile')).toBe('/profile')
  })

  it('lets signed-out users reach /onboarding without looping', async () => {
    loadAuthMenuMock.mockResolvedValue({ status: 'signed-out' })
    expect(await pathnameAfterNavigation('/onboarding')).toBe('/onboarding')
  })

  it('fails open on auth-menu errors so a network blip does not strand the user', async () => {
    loadAuthMenuMock.mockRejectedValue(new Error('network down'))
    expect(await pathnameAfterNavigation('/profile')).toBe('/profile')
  })
})
