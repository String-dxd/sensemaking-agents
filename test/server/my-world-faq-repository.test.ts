import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  addTeamFaqQuestion,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  digestMyWorldFaqDocument,
} from '~/data/my-world-faq'
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
  it('hydrates both supported document structures with row integrity checks intact', async () => {
    const v1 = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    const v2 = addTeamFaqQuestion(v1, {
      id: 'team-11111111-1111-4111-8111-111111111111',
      clusterId: 'evidence-next-decision',
      displayedQuestion: 'Can the repository hydrate this supported revision?',
      shortAnswer:
        'The repository validates either supported document structure, recomputes its digest, and checks that every stored version column agrees with the document.',
      detailedAnswer:
        'This v2 working answer remains open to human review, evidence and correction.',
      limitations: 'Unknown future structures still fail closed as repository corruption.',
      reviewDate: '2026-07-30',
    })

    for (const [index, document] of [v1, v2].entries()) {
      const digest = await digestMyWorldFaqDocument(document)
      const repository = createMyWorldFaqRepository(
        fakeDatabase({
          execute: vi.fn().mockResolvedValue({
            rows: [
              {
                revisionId: randomUUID(),
                version: index + 1,
                document,
                schemaVersion: document.schemaVersion,
                structureVersion: document.structureVersion,
                digest,
                attributionKind: index === 0 ? 'system-import' : 'self-declared',
                savedByName: index === 0 ? null : 'FAQ teammate',
                createdAt: new Date('2026-07-30T00:00:00.000Z'),
                restoredFromRevisionId: null,
                attemptId: randomUUID(),
                requestFingerprint: '1'.repeat(64),
              },
            ],
          }),
        } as unknown as AppDatabase),
      )

      await expect(repository.loadPublicSnapshot()).resolves.toMatchObject({
        structureVersion: document.structureVersion,
        document,
      })
    }
  })

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
