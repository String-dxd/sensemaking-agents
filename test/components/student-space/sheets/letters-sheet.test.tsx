/**
 * React LettersSheet (U3 of the migration) — replaces
 * `src/engine/student-space/Game/View/LettersSheet.js`. Tests run against a
 * minimal TanStack Router tree with a stub Game instance threaded through
 * EngineContext so the slice subscription path exercises real code.
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LettersSheet } from '~/components/student-space/sheets/LettersSheet'
import { EngineContext } from '~/lib/student-space/use-engine'

interface FakeLetter {
  id: string
  from: string
  subject: string
  body: string
  sentAt: string
  read: boolean
  prompt?: string
}

function makeLettersSlice(initial: FakeLetter[]) {
  let letters = [...initial]
  const subscribers = new Set<() => void>()
  return {
    get letters() {
      return letters
    },
    markRead: vi.fn((id: string) => {
      const letter = letters.find((l) => l.id === id)
      if (!letter || letter.read) return null
      letters = letters.map((l) => (l.id === id ? { ...l, read: true } : l))
      for (const cb of subscribers) cb()
      return letter
    }),
    subscribe(cb: () => void) {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
  }
}

function makeFakeEngine(letters: ReturnType<typeof makeLettersSlice>) {
  return {
    state: { letters },
    view: { overlayController: { open: vi.fn() } },
  }
}

function renderLetters(engine: ReturnType<typeof makeFakeEngine>) {
  const rootRoute = createRootRoute({
    component: () => (
      <EngineContext.Provider value={engine as never}>
        <LettersSheet />
      </EngineContext.Provider>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, catchAllRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/letters'] }),
  })
  return render(<RouterProvider router={router} />)
}

afterEach(() => {
  document.body.classList.remove('has-overlay')
})

const seed: FakeLetter[] = [
  {
    id: 'lt-1',
    from: 'Ms. Tan',
    subject: 'After camp',
    body: 'You showed up for your team.\n\nThat matters.',
    sentAt: '2026-05-20T08:00:00.000Z',
    read: false,
  },
  {
    id: 'lt-2',
    from: 'Ms. Tan',
    subject: 'About the maths test',
    body: 'You can be hard on yourself.',
    sentAt: '2026-05-10T08:00:00.000Z',
    read: true,
  },
  {
    id: 'lt-3',
    from: 'Ms. Tan',
    subject: 'A pattern',
    body: 'Three weeks running.',
    sentAt: '2026-05-22T08:00:00.000Z',
    read: false,
    prompt: 'What are three moments?',
  },
]

describe('LettersSheet (React)', () => {
  let slice: ReturnType<typeof makeLettersSlice>
  let engine: ReturnType<typeof makeFakeEngine>

  beforeEach(() => {
    slice = makeLettersSlice(seed)
    engine = makeFakeEngine(slice)
  })

  it('auto-selects the newest unread letter on first paint (no auto-mark-read)', async () => {
    renderLetters(engine)
    // Newest unread is lt-3 ("A pattern"); its subject lands in the page header.
    const titles = await screen.findAllByText('A pattern')
    expect(titles.length).toBeGreaterThan(0)
    // Engine behavior: auto-select does NOT mark read — only deep-link or click does.
    expect(slice.markRead).not.toHaveBeenCalled()
  })

  it('clicking a different letter selects it and marks it read', async () => {
    renderLetters(engine)
    // Wait for the sidebar list to render.
    const list = await screen.findByRole('list', { name: 'Letters' })
    const items = within(list).getAllByRole('listitem')
    const afterCamp = items.find((item) => within(item).queryByText('After camp'))
    expect(afterCamp).toBeDefined()
    await userEvent.click(within(afterCamp as HTMLElement).getByRole('button'))
    expect(slice.markRead).toHaveBeenCalledWith('lt-1')
  })

  it('renders the empty-state copy when there are no letters', async () => {
    slice = makeLettersSlice([])
    engine = makeFakeEngine(slice)
    renderLetters(engine)
    expect(await screen.findByText(/No letters yet\. Your teacher will write/i)).toBeInTheDocument()
  })

  it('renders the capture CTA when the selected letter carries a prompt', async () => {
    renderLetters(engine)
    expect(await screen.findByText('What are three moments?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /capture/i })).toBeInTheDocument()
  })

  it('capture CTA opens the engine Ask overlay with prompt + letterId', async () => {
    renderLetters(engine)
    const btn = await screen.findByRole('button', { name: /capture/i })
    await userEvent.click(btn)
    expect(engine.view.overlayController.open).toHaveBeenCalledWith('ask', {
      prompt: 'What are three moments?',
      dismissOnBack: true,
      letterId: 'lt-3',
    })
  })

  it('adds body.has-overlay while mounted and removes it on unmount', async () => {
    const { unmount } = renderLetters(engine)
    await waitFor(() => expect(document.body.classList.contains('has-overlay')).toBe(true))
    unmount()
    expect(document.body.classList.contains('has-overlay')).toBe(false)
  })
})
