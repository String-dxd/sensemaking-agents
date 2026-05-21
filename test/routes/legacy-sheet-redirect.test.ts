/**
 * Legacy ?sheet=… redirect. The home route's beforeLoad intercepts
 * inbound `/?sheet=profile`, `/?sheet=growth`, etc. and rewrites them to
 * the new canonical paths so externally-shared links and old bookmarks
 * still land on the right surface.
 *
 * We exercise the redirect through a memory-history router rather than
 * importing the route's internals — this protects the behavior, not the
 * implementation.
 */
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { routeTree } from '~/routeTree.gen'

async function locationAfterNavigation(initial: string): Promise<{
  pathname: string
  hash: string
  search: Record<string, unknown>
}> {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  await router.load()
  const { pathname, hash, search } = router.state.location
  return { pathname, hash, search: search as Record<string, unknown> }
}

describe('legacy ?sheet= redirect', () => {
  it('redirects /?sheet=profile to /profile', async () => {
    const final = await locationAfterNavigation('/?sheet=profile')
    expect(final.pathname).toBe('/profile')
  })

  it('redirects /?sheet=growth to /history/growth', async () => {
    const final = await locationAfterNavigation('/?sheet=growth')
    expect(final.pathname).toBe('/history/growth')
  })

  it('redirects /?sheet=trajectory to /trajectory', async () => {
    const final = await locationAfterNavigation('/?sheet=trajectory')
    expect(final.pathname).toBe('/trajectory')
  })

  it('redirects /?sheet=reflections to /history', async () => {
    const final = await locationAfterNavigation('/?sheet=reflections')
    expect(final.pathname).toBe('/history')
  })

  it('redirects /?sheet=letters to /letters', async () => {
    const final = await locationAfterNavigation('/?sheet=letters')
    expect(final.pathname).toBe('/letters')
  })

  it('preserves the reflection hash when entryId is encoded', async () => {
    const final = await locationAfterNavigation('/?sheet=reflections#reflection-42')
    expect(final.pathname).toBe('/history')
    // TanStack normalises the leading `#` off the hash value.
    expect(final.hash.replace(/^#/, '')).toBe('reflection-42')
  })

  it('preserves the ?filter=need-review query on the redirect', async () => {
    const final = await locationAfterNavigation('/?sheet=reflections&filter=need-review')
    expect(final.pathname).toBe('/history')
    expect(final.search.filter).toBe('need-review')
  })

  it('does not redirect when sheet is missing', async () => {
    const final = await locationAfterNavigation('/')
    expect(final.pathname).toBe('/')
  })

  it('falls through to / when the sheet value is unknown', async () => {
    const final = await locationAfterNavigation('/?sheet=bogus')
    expect(final.pathname).toBe('/')
  })
})
