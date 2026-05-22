/**
 * React ProfileSheet (U7 of the migration) — replaces the former
 * engine-owned ProfileSheet route surface. Coverage keeps the important
 * interaction contract alive: rich VIPS tabs, claim filtering, forget, route
 * tabs, body overlay lifecycle, and the React Share dialog.
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileSheet } from '~/components/student-space/sheets/ProfileSheet'
import { EngineContext } from '~/lib/student-space/use-engine'

type FakeProfile = ReturnType<typeof makeProfile>

function makeProfile() {
  const subscribers = new Set<() => void>()
  const facets = {
    values: {
      id: 'values',
      paragraph: 'Contribution and learning keep surfacing in your reflections.',
      openQuestion: 'Where does helping stay sustainable?',
      lastRefinedAt: '2026-05-21T08:00:00.000Z',
      quotes: [
        {
          id: 'q1',
          text: 'I keep showing up when someone needs help.',
          canonicalClaimId: 'values.contribution',
          confidence: 'high',
          sourceCaptureId: 'ask-1',
          createdAt: '2026-05-21T08:00:00.000Z',
        },
        {
          id: 'q2',
          text: 'I ask why before I take notes.',
          canonicalClaimId: 'values.learning',
          confidence: 'medium',
          createdAt: '2026-05-20T08:00:00.000Z',
        },
        {
          id: 'q3',
          text: 'I want to pick the path myself.',
          canonicalClaimId: 'values.independence',
          confidence: 'medium',
          createdAt: '2026-05-19T08:00:00.000Z',
        },
      ],
    },
    interests: { id: 'interests', paragraph: '', openQuestion: '', quotes: [] },
    personality: { id: 'personality', paragraph: '', openQuestion: '', quotes: [] },
    skills: { id: 'skills', paragraph: '', openQuestion: '', quotes: [] },
  }

  return {
    subscribers,
    identity: { name: 'Mei', className: 'Sec 3B', avatarDataUrl: null },
    getFacet: vi.fn((facet: keyof typeof facets) => facets[facet] ?? null),
    countByClaim: vi.fn((facet: keyof typeof facets) => {
      const counts: Record<string, number> = {}
      for (const quote of facets[facet]?.quotes ?? []) {
        counts[quote.canonicalClaimId] = (counts[quote.canonicalClaimId] ?? 0) + 1
      }
      return counts
    }),
    forgetQuote: vi.fn((facet: keyof typeof facets, quoteId: string) => {
      const target = facets[facet]
      if (!target) return null
      target.quotes = target.quotes.filter((quote) => quote.id !== quoteId)
      for (const subscriber of subscribers) subscriber()
      return quoteId
    }),
    subscribe: vi.fn(function (this: { subscribers: Set<() => void> }, cb: () => void) {
      this.subscribers.add(cb)
      return () => this.subscribers.delete(cb)
    }),
  }
}

function makeEngine(profile: FakeProfile = makeProfile()) {
  return {
    state: {
      profile,
      auth: { menu: { status: 'signed-out' }, subscribe: vi.fn(() => vi.fn()) },
      captures: { findById: vi.fn(() => ({ kind: 'ask' })) },
      moodPins: { pins: [] },
      backend: null,
    },
    view: { overlayController: { open: vi.fn() } },
  }
}

function renderProfile(engine = makeEngine(), path = '/profile') {
  const rootRoute = createRootRoute({
    component: () => (
      <EngineContext.Provider value={engine as never}>
        <ProfileSheet />
      </EngineContext.Provider>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const profileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/profile',
    component: () => null,
  })
  const profileTabRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/profile/$tab',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, profileRoute, profileTabRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return { ...render(<RouterProvider router={router} />), engine, router }
}

afterEach(() => {
  document.body.classList.remove('has-overlay')
  vi.restoreAllMocks()
})

describe('ProfileSheet (React)', () => {
  it('renders identity, TLDR, collection, and timeline for a VIPS tab', async () => {
    renderProfile()

    expect(await screen.findByRole('heading', { name: 'Mei' })).toBeInTheDocument()
    expect(
      screen.getByText('Contribution and learning keep surfacing in your reflections.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Top voices in your Values')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Contribution/i })).toHaveLength(2)
    expect(screen.getByText('"I keep showing up when someone needs help."')).toBeInTheDocument()
  })

  it.each([
    {
      path: '/profile/personality',
      tag: 'Personality',
      heading: 'How you tend to show up',
      previousTitle: 'Who you are in the room',
      duplicatedKicker: 'HOW YOU TEND TO SHOW UP',
    },
    {
      path: '/profile',
      tag: 'Values',
      heading: 'What matters to me',
      previousTitle: 'What you keep coming back to',
      duplicatedKicker: 'WHAT MATTERS TO ME',
    },
  ])('renders $tag with a facet badge and a single kicker heading', async (tab) => {
    renderProfile(makeEngine(), tab.path)

    const heading = await screen.findByRole('heading', { level: 2, name: tab.heading })
    const tabHeader = heading.closest('section')

    expect(tabHeader).toBeTruthy()
    expect(within(tabHeader as HTMLElement).getByText(tab.tag)).toBeInTheDocument()
    expect(screen.queryByText(tab.previousTitle)).not.toBeInTheDocument()
    expect(screen.queryByText(tab.duplicatedKicker)).not.toBeInTheDocument()
  })

  it('subscribes to the Profile slice without losing method context', async () => {
    const profile = makeProfile()
    renderProfile(makeEngine(profile))

    expect(await screen.findByRole('heading', { name: 'Mei' })).toBeInTheDocument()
    expect(profile.subscribe).toHaveBeenCalled()
    expect(profile.subscribers.size).toBeGreaterThan(0)
  })

  it('renders claim thumbnails for collection cards', async () => {
    renderProfile()

    await screen.findByText('Top voices in your Values')
    const thumbnails = screen.getAllByTestId('profile-claim-thumbnail') as HTMLImageElement[]
    expect(thumbnails).toHaveLength(8)
    expect(thumbnails[0]?.src).toContain('data:image/svg+xml')
    expect(new Set(thumbnails.map((thumbnail) => thumbnail.src)).size).toBeGreaterThan(1)
  })

  it('filters the timeline when a collection tile is selected', async () => {
    renderProfile()

    const learningTile = (await screen.findAllByRole('button', { name: /Learning/i })).at(-1)
    expect(learningTile).toBeTruthy()
    await userEvent.click(learningTile as HTMLElement)

    expect(screen.getByText('"I ask why before I take notes."')).toBeInTheDocument()
    expect(
      screen.queryByText('"I keep showing up when someone needs help."'),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('Learning').length).toBeGreaterThan(0)
  })

  it('forgets a quote with the two-tap affordance', async () => {
    const profile = makeProfile()
    renderProfile(makeEngine(profile))

    const card = (await screen.findByText('"I ask why before I take notes."')).closest('li')
    expect(card).toBeTruthy()
    const forget = within(card as HTMLElement).getByRole('button', { name: 'forget' })
    await userEvent.click(forget)
    expect(forget).toHaveTextContent('tap again to forget')
    await userEvent.click(forget)

    await waitFor(() => expect(profile.forgetQuote).toHaveBeenCalledWith('values', 'q2'))
  })

  it('routes non-VIPS tabs through their React panels', async () => {
    const { router } = renderProfile()

    await userEvent.click(await screen.findByRole('tab', { name: 'Relationships' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/profile/relationships'))
    expect(screen.getByTestId('relationships-page')).toBeInTheDocument()
  })

  it('opens the React Share dialog and creates a token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          token: 'AAAA1111BBBB2222CCCC33',
          url: '/share/AAAA1111BBBB2222CCCC33',
        }),
      })),
    )
    renderProfile()

    await userEvent.click(await screen.findByTestId('profile-share-button'))

    expect(await screen.findByTestId('share-dialog')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByDisplayValue('/share/AAAA1111BBBB2222CCCC33')).toBeInTheDocument(),
    )
  })

  it('adds body.has-overlay while mounted and removes it on unmount', async () => {
    const { unmount } = renderProfile()
    await waitFor(() => expect(document.body.classList.contains('has-overlay')).toBe(true))
    unmount()
    expect(document.body.classList.contains('has-overlay')).toBe(false)
  })
})
