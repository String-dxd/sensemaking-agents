// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.fn()
const transaction = vi.fn()

vi.mock('~/db/client', () => ({
  getMyWorldFaqSystemDatabase: () => ({ execute, transaction }),
}))

const { listPublicMyWorldFaqFeedback } = await import(
  '~/server/my-world-faq-feedback-repository.server'
)

describe('My World FAQ public feedback repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('purges expired feedback and returns only retained rows in one query', async () => {
    execute.mockResolvedValue({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'suggestion',
          message: 'Keep the public page responsive.',
          created_at: new Date('2026-08-03T00:00:00.000Z'),
        },
      ],
    })

    await expect(listPublicMyWorldFaqFeedback()).resolves.toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'suggestion',
        message: 'Keep the public page responsive.',
        createdAt: '2026-08-03T00:00:00.000Z',
      },
    ])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(transaction).not.toHaveBeenCalled()
    const queryShape = JSON.stringify(execute.mock.calls[0]?.[0]).replace(/\s+/g, ' ')
    expect(queryShape).toContain('delete from my_world_faq_feedback')
    expect(queryShape).toContain('created_at < now() - (')
    expect(queryShape).toContain("interval '1 day'")
    expect(queryShape).toContain('created_at >= now() - (')
  })
})
