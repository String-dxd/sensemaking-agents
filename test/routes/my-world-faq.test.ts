import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import { SHEET_HREFS } from '~/components/student-space/navigation/nav-items'
import { DEFAULT_MY_WORLD_FAQ_CONTENT, prepareMyWorldFaqPublicCopy } from '~/data/my-world-faq'
import {
  createMyWorldFaqPageShowHandler,
  MY_WORLD_FAQ_PUBLIC_UNAVAILABLE_MESSAGE,
  myWorldFaqHead,
  Route,
} from '~/routes/my-world.faq'
import { routeTree } from '~/routeTree.gen'

const loadAuthMenuMock = vi.hoisted(() => vi.fn())
const engineHostMock = vi.hoisted(() => vi.fn())
const loadMyWorldFaqContentMock = vi.hoisted(() => vi.fn())
const loadMyWorldFaqPublicFeedbackMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/auth-menu.functions', () => ({
  loadAuthMenu: loadAuthMenuMock,
}))

vi.mock('~/components/student-space/EngineHost', () => ({
  EngineHost: engineHostMock,
}))

vi.mock('~/server/my-world-faq-content.functions', () => ({
  loadMyWorldFaqContent: loadMyWorldFaqContentMock,
}))

vi.mock('~/server/my-world-faq-feedback.functions', () => ({
  loadMyWorldFaqPublicFeedback: loadMyWorldFaqPublicFeedbackMock,
  loadMyWorldFaqFeedbackInbox: vi.fn(),
  deleteMyWorldFaqFeedback: vi.fn(),
  submitMyWorldFaqFeedback: vi.fn(),
}))

type RouteHead = {
  meta?: Array<Record<string, string | undefined>>
}

const EXPECTED_PUBLIC_CONTENT = prepareMyWorldFaqPublicCopy(DEFAULT_MY_WORLD_FAQ_CONTENT)

function metaContent(head: RouteHead, key: 'name' | 'property', value: string) {
  return head.meta?.find((entry) => entry[key] === value)?.content
}

describe('/my-world/faq public route', () => {
  beforeEach(() => {
    loadMyWorldFaqContentMock.mockReset()
    loadMyWorldFaqContentMock.mockResolvedValue(DEFAULT_MY_WORLD_FAQ_CONTENT)
    loadMyWorldFaqPublicFeedbackMock.mockReset()
    loadMyWorldFaqPublicFeedbackMock.mockResolvedValue({ status: 'unavailable', items: [] })
  })

  it('matches the direct signed-out URL outside the authenticated app layout', async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ['/my-world/faq'] }),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/my-world/faq')
    expect(router.state.matches.map((match) => match.routeId)).toContain('/my-world/faq')
    expect(router.state.matches.at(-1)?.loaderData).toEqual({
      content: EXPECTED_PUBLIC_CONTENT,
    })
    expect(loadMyWorldFaqPublicFeedbackMock).not.toHaveBeenCalled()
    expect(loadAuthMenuMock).not.toHaveBeenCalled()
    expect(engineHostMock).not.toHaveBeenCalled()
  })

  it('explains the site purpose while signed out', () => {
    render(
      createElement(MyWorldFaqPage, {
        feedbackEnabled: false,
        content: EXPECTED_PUBLIC_CONTENT,
      }),
    )

    expect(screen.getByText('Hello, DXD & friends :)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My World FAQ home' })).toHaveTextContent(
      'My World FAQ',
    )
    expect(screen.queryByText('Pilot under consideration')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/leadership has not decided whether to run one/i),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/documents the current state of our proposed concept/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/gathers your feedback to guide how we take it forward/i),
    ).toBeInTheDocument()
    expect(screen.getByTestId('faq-product-loop')).toBeInTheDocument()
    expect(screen.getAllByTestId('faq-question-trigger')).toHaveLength(34)
    expect(screen.getByRole('link', { name: 'Product at a glance' })).toHaveAttribute(
      'href',
      '#product',
    )
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq')
    expect(screen.getAllByText(/what does Companion do/i).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/Kira/)).toHaveLength(0)

    expect(loadAuthMenuMock).not.toHaveBeenCalled()
    expect(engineHostMock).not.toHaveBeenCalled()
  })

  it('states that exact-link access is forwardable rather than private', () => {
    render(
      createElement(MyWorldFaqPage, {
        feedbackEnabled: false,
        content: DEFAULT_MY_WORLD_FAQ_CONTENT,
      }),
    )

    expect(screen.getByText(/anyone with this link can view or share it/i)).toBeInTheDocument()
  })

  it('uses a normal document-scroll root and exposes the disabled feedback capability', () => {
    render(
      createElement(MyWorldFaqPage, {
        feedbackEnabled: false,
        content: DEFAULT_MY_WORLD_FAQ_CONTENT,
      }),
    )

    const page = screen.getByTestId('my-world-faq-page')
    expect(page).toHaveClass('min-h-svh')
    expect(page).not.toHaveClass('fixed')
    expect(page).toHaveAttribute('data-feedback-enabled', 'false')
  })

  it('derives social metadata from the loaded publication and keeps noindex directives', () => {
    const content = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    content.route.title = 'A newly published FAQ title'
    content.route.description = 'A newly published FAQ description.'
    const head = myWorldFaqHead(content)

    expect(head.meta).toContainEqual({ title: 'A newly published FAQ title' })
    expect(metaContent(head, 'name', 'description')).toBe('A newly published FAQ description.')
    expect(metaContent(head, 'name', 'robots')).toBe('noindex, nofollow')
    expect(metaContent(head, 'property', 'og:title')).toBe('A newly published FAQ title')
    expect(metaContent(head, 'property', 'og:description')).toBe(
      'A newly published FAQ description.',
    )
    expect(metaContent(head, 'name', 'twitter:card')).toBe('summary')
  })

  it('does not make initial rendering wait for the feedback store', async () => {
    const loader = Route.options.loader
    if (!loader) throw new Error('FAQ route must declare a loader')

    await expect((loader as () => Promise<unknown> | unknown)()).resolves.toEqual({
      content: EXPECTED_PUBLIC_CONTENT,
    })
    expect(loadMyWorldFaqPublicFeedbackMock).not.toHaveBeenCalled()
  })

  it('loads feedback after the page content is already available', async () => {
    let finishLoading: ((value: { status: 'ready'; items: [] }) => void) | undefined
    loadMyWorldFaqPublicFeedbackMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLoading = resolve
      }),
    )

    render(
      createElement(MyWorldFaqPage, {
        feedbackEnabled: true,
        content: EXPECTED_PUBLIC_CONTENT,
      }),
    )

    expect(screen.getByText('Hello, DXD & friends :)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share without a name' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading shared feedback…')
    expect(loadMyWorldFaqPublicFeedbackMock).toHaveBeenCalledTimes(1)

    finishLoading?.({ status: 'ready', items: [] })
    expect(await screen.findByRole('button', { name: 'Share without a name' })).toBeInTheDocument()
  })

  it('refreshes lazy feedback after a persisted Back/Forward restoration', async () => {
    loadMyWorldFaqPublicFeedbackMock
      .mockResolvedValueOnce({ status: 'ready', items: [] })
      .mockResolvedValueOnce({ status: 'ready', items: [] })

    render(
      createElement(MyWorldFaqPage, {
        feedbackEnabled: true,
        content: EXPECTED_PUBLIC_CONTENT,
      }),
    )

    await screen.findByRole('button', { name: 'Share without a name' })
    const pageShow = new Event('pageshow')
    Object.defineProperty(pageShow, 'persisted', { value: true })
    act(() => window.dispatchEvent(pageShow))

    await waitFor(() => expect(loadMyWorldFaqPublicFeedbackMock).toHaveBeenCalledTimes(2))
  })

  it('keeps feedback fail-closed and offers a retry when loading fails', async () => {
    loadMyWorldFaqPublicFeedbackMock
      .mockResolvedValueOnce({ status: 'unavailable', items: [] })
      .mockResolvedValueOnce({ status: 'ready', items: [] })

    render(
      createElement(MyWorldFaqPage, {
        feedbackEnabled: true,
        content: EXPECTED_PUBLIC_CONTENT,
      }),
    )

    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(screen.queryByRole('button', { name: 'Share without a name' })).not.toBeInTheDocument()
    act(() => retry.click())

    expect(await screen.findByRole('button', { name: 'Share without a name' })).toBeInTheDocument()
  })

  it('sanitizes loader failures before the root error UI can render them', async () => {
    loadMyWorldFaqContentMock.mockRejectedValueOnce(
      new Error('DATABASE_URL=postgres://private-host/raw-sql-failure'),
    )
    const loader = Route.options.loader
    if (!loader) throw new Error('FAQ route must declare a loader')

    await expect((loader as () => Promise<unknown> | unknown)()).rejects.toThrow(
      MY_WORLD_FAQ_PUBLIC_UNAVAILABLE_MESSAGE,
    )
  })

  it('is immediately stale and reloads on persisted Back/Forward restoration', async () => {
    expect(Route.options.staleTime).toBe(0)
    expect(Route.options.preloadStaleTime).toBe(0)
    expect(Route.options.shouldReload).toBe(true)

    const revalidate = vi.fn()
    const onPageShow = createMyWorldFaqPageShowHandler(revalidate)
    onPageShow({ persisted: false } as PageTransitionEvent)
    expect(revalidate).not.toHaveBeenCalled()
    onPageShow({ persisted: true } as PageTransitionEvent)
    expect(revalidate).toHaveBeenCalledTimes(1)
  })

  it('declares response revalidation instead of making browser state authoritative', () => {
    const headers = Route.options.headers
    if (!headers) throw new Error('FAQ route must declare response headers')
    const values = (headers as () => Record<string, string>)()

    expect(values['Cache-Control']).toBe('no-cache, max-age=0, must-revalidate')
    expect(values['CDN-Cache-Control']).toBe('no-store')
    expect(values['Vercel-CDN-Cache-Control']).toBe('no-store')
  })

  it('stays absent from Student Space navigation', () => {
    expect(Object.values(SHEET_HREFS)).not.toContain('/my-world/faq')
  })
})
