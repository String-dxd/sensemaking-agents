import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '~/routeTree.gen'

const loadMyWorldFaqEditorMock = vi.hoisted(() => vi.fn())
const loadMyWorldFaqContentMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/my-world-faq-editor.functions', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/server/my-world-faq-editor.functions')>()
  return {
    ...original,
    loadMyWorldFaqEditor: loadMyWorldFaqEditorMock,
  }
})

vi.mock('~/server/my-world-faq-content.functions', () => ({
  loadMyWorldFaqContent: loadMyWorldFaqContentMock,
}))

describe('My World FAQ editor route tree', () => {
  beforeEach(() => {
    loadMyWorldFaqEditorMock.mockReset()
    loadMyWorldFaqEditorMock.mockResolvedValue({ status: 'locked' })
    loadMyWorldFaqContentMock.mockReset()
  })

  it('is a root child and never runs the public FAQ loader first', async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ['/my-world/faq/edit'] }),
    })

    await router.load()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/my-world/faq_/edit',
    ])
    expect(router.state.matches.at(-1)?.loaderData).toEqual({ status: 'locked' })
    expect(loadMyWorldFaqEditorMock).toHaveBeenCalledTimes(1)
    expect(loadMyWorldFaqContentMock).not.toHaveBeenCalled()
  })
})
