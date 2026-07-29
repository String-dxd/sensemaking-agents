import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import { SHEET_HREFS } from '~/components/student-space/navigation/nav-items'
import { Route } from '~/routes/my-world.faq'
import { routeTree } from '~/routeTree.gen'

const loadAuthMenuMock = vi.hoisted(() => vi.fn())
const engineHostMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/auth-menu.functions', () => ({
  loadAuthMenu: loadAuthMenuMock,
}))

vi.mock('~/components/student-space/EngineHost', () => ({
  EngineHost: engineHostMock,
}))

type RouteHead = {
  meta?: Array<Record<string, string>>
}

function routeHead(): RouteHead {
  const head = Route.options.head
  if (!head) throw new Error('FAQ route must declare head metadata')
  return (head as () => RouteHead)()
}

function metaContent(head: RouteHead, key: 'name' | 'property', value: string) {
  return head.meta?.find((entry) => entry[key] === value)?.content
}

describe('/my-world/faq public route', () => {
  it('matches the direct signed-out URL outside the authenticated app layout', async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ['/my-world/faq'] }),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/my-world/faq')
    expect(router.state.matches.map((match) => match.routeId)).toContain('/my-world/faq')
    expect(router.state.matches.at(-1)?.loaderData).toEqual({ feedbackEnabled: false })
    expect(loadAuthMenuMock).not.toHaveBeenCalled()
    expect(engineHostMock).not.toHaveBeenCalled()
  })

  it('renders the concise working prototype while signed out', () => {
    render(createElement(MyWorldFaqPage, { feedbackEnabled: false }))

    expect(screen.getByText('Working prototype')).toBeInTheDocument()
    expect(screen.queryByText('Pilot under consideration')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/leadership has not decided whether to run one/i),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/one touchpoint alongside family/i)).toBeInTheDocument()
    expect(screen.getByTestId('faq-product-loop')).toBeInTheDocument()
    expect(screen.getAllByTestId('faq-question-trigger')).toHaveLength(34)
    expect(screen.getByRole('link', { name: 'Product at a glance' })).toHaveAttribute(
      'href',
      '#product',
    )
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq')

    expect(loadAuthMenuMock).not.toHaveBeenCalled()
    expect(engineHostMock).not.toHaveBeenCalled()
  })

  it('states that exact-link access is forwardable rather than private', () => {
    render(createElement(MyWorldFaqPage, { feedbackEnabled: false }))

    expect(screen.getByText(/anyone with this link can open or forward it/i)).toBeInTheDocument()
  })

  it('uses a normal document-scroll root and exposes the disabled feedback capability', () => {
    render(createElement(MyWorldFaqPage, { feedbackEnabled: false }))

    const page = screen.getByTestId('my-world-faq-page')
    expect(page).toHaveClass('min-h-svh')
    expect(page).not.toHaveClass('fixed')
    expect(page).toHaveAttribute('data-feedback-enabled', 'false')
  })

  it('declares dedicated generic metadata and noindex directives', () => {
    const head = routeHead()

    expect(head.meta).toContainEqual({ title: 'My World: Signals → Sensemaking' })
    expect(metaContent(head, 'name', 'description')).toMatch(/working prototype/i)
    expect(metaContent(head, 'name', 'robots')).toBe('noindex, nofollow')
    expect(metaContent(head, 'property', 'og:title')).toBe('My World: Signals → Sensemaking')
    expect(metaContent(head, 'property', 'og:description')).toMatch(/working prototype/i)
    expect(metaContent(head, 'name', 'twitter:card')).toBe('summary')
  })

  it('keeps the feedback capability fail-closed by default', async () => {
    const loader = Route.options.loader
    if (!loader) throw new Error('FAQ route must declare a loader')

    await expect((loader as () => Promise<unknown> | unknown)()).resolves.toEqual({
      feedbackEnabled: false,
    })
  })

  it('stays absent from Student Space navigation', () => {
    expect(Object.values(SHEET_HREFS)).not.toContain('/my-world/faq')
  })
})
