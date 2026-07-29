import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '~/db/client'
import {
  createMyWorldFaqRepository,
  MyWorldFaqRepositoryError,
} from '~/server/my-world-faq-repository.server'

function fakeDatabase(overrides: Partial<AppDatabase> = {}): AppDatabase {
  return {
    execute: vi.fn(),
    transaction: vi.fn(),
    ...overrides,
  } as unknown as AppDatabase
}

describe('My World FAQ repository boundary', () => {
  it('rejects an invalid document before opening a transaction', async () => {
    const transaction = vi.fn()
    const repository = createMyWorldFaqRepository(
      fakeDatabase({ transaction } as unknown as AppDatabase),
    )

    await expect(
      repository.publishRevision({
        document: { schemaVersion: 1 },
        expectedBase: {
          revisionId: randomUUID(),
          version: 1,
          digest: '0'.repeat(64),
        },
        attemptId: randomUUID(),
        savedByName: 'FAQ teammate',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('maps database connectivity failures without exposing their raw detail', async () => {
    const cause = Object.assign(new Error('postgresql://secret-host/private'), {
      code: 'ECONNREFUSED',
    })
    const repository = createMyWorldFaqRepository(
      fakeDatabase({
        execute: vi.fn().mockRejectedValue(cause),
      } as unknown as AppDatabase),
    )

    const error = await repository.loadPublicSnapshot().catch((caught) => caught)

    expect(error).toBeInstanceOf(MyWorldFaqRepositoryError)
    expect(error).toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    expect(String(error)).not.toContain('secret-host')
  })

  it('classifies invalid persisted content as repository corruption', async () => {
    const repository = createMyWorldFaqRepository(
      fakeDatabase({
        execute: vi.fn().mockResolvedValue({
          rows: [
            {
              revisionId: randomUUID(),
              version: 1,
              document: {},
              schemaVersion: 1,
              structureVersion: 1,
              digest: '0'.repeat(64),
              attributionKind: 'system-import',
              savedByName: null,
              createdAt: new Date(),
              restoredFromRevisionId: null,
              attemptId: randomUUID(),
              requestFingerprint: '1'.repeat(64),
            },
          ],
        }),
      } as unknown as AppDatabase),
    )

    await expect(repository.loadPublicSnapshot()).rejects.toMatchObject({
      code: 'CORRUPT_STATE',
    })
  })
})
