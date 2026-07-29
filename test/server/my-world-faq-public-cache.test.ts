import type { RuntimeCache } from '@vercel/functions'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  digestMyWorldFaqDocument,
  MY_WORLD_FAQ_SCHEMA_VERSION,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
} from '~/data/my-world-faq'
import {
  publicCacheEnvelopeFromSnapshot,
  readMyWorldFaqPublicCache,
  validatePublicCacheEnvelope,
  writeCurrentMyWorldFaqPublicCache,
  writeMyWorldFaqPublicCache,
} from '~/server/my-world-faq-public-cache.server'
import type { MyWorldFaqPublicSnapshot } from '~/server/my-world-faq-repository.server'

const REVISION_ID = '11111111-1111-4111-8111-111111111111'

async function snapshot(
  content = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT),
  version = 7,
): Promise<MyWorldFaqPublicSnapshot> {
  return {
    head: {
      revisionId: REVISION_ID,
      version,
      digest: await digestMyWorldFaqDocument(content),
    },
    schemaVersion: content.schemaVersion,
    structureVersion: content.structureVersion,
    document: content,
  }
}

function memoryCache(): RuntimeCache & { value: unknown } {
  const cache = {
    value: null as unknown,
    delete: vi.fn(async () => {
      cache.value = null
    }),
    get: vi.fn(async () => cache.value),
    set: vi.fn(async (_key: string, value: unknown) => {
      cache.value = value
    }),
    expireTag: vi.fn(async () => {}),
  }
  return cache
}

describe('My World FAQ public last-known-good cache', () => {
  it('round-trips a validated public-only integrity envelope', async () => {
    const cache = memoryCache()
    const publication = await snapshot()

    await writeMyWorldFaqPublicCache(publication, cache)
    const restored = await readMyWorldFaqPublicCache(cache)

    expect(restored).toMatchObject({
      cacheEnvelopeVersion: 1,
      pageKey: 'my-world-faq',
      revisionId: REVISION_ID,
      revisionVersion: 7,
      documentDigest: publication.head.digest,
      schemaVersion: MY_WORLD_FAQ_SCHEMA_VERSION,
      structureVersion: MY_WORLD_FAQ_STRUCTURE_VERSION,
      content: DEFAULT_MY_WORLD_FAQ_CONTENT,
    })
    expect(cache.value).not.toHaveProperty('savedByName')
    expect(cache.value).not.toHaveProperty('displayName')
    expect(cache.value).not.toHaveProperty('sessions')
    expect(cache.value).not.toHaveProperty('history')
    expect(cache.value).not.toHaveProperty('dirtyPaths')
  })

  it('rejects content changed without a matching digest', async () => {
    const envelope = await publicCacheEnvelopeFromSnapshot(await snapshot())
    const corrupt = structuredClone(envelope)
    corrupt.content.page.hero.heading = 'Tampered in cache'

    await expect(validatePublicCacheEnvelope(corrupt)).resolves.toBeNull()
  })

  it('rejects unknown fields and incompatible envelope versions', async () => {
    const envelope = await publicCacheEnvelopeFromSnapshot(await snapshot())

    await expect(
      validatePublicCacheEnvelope({ ...envelope, savedByName: 'Private editor metadata' }),
    ).resolves.toBeNull()
    await expect(
      validatePublicCacheEnvelope({ ...envelope, cacheEnvelopeVersion: 2 }),
    ).resolves.toBeNull()
    await expect(
      validatePublicCacheEnvelope({ ...envelope, schemaVersion: 999 }),
    ).resolves.toBeNull()
  })

  it('refuses to write a snapshot whose head does not match its document', async () => {
    const publication = await snapshot()
    publication.head.digest = '0'.repeat(64)

    await expect(publicCacheEnvelopeFromSnapshot(publication)).rejects.toThrow(
      'Cannot cache an invalid My World FAQ publication.',
    )
  })

  it('skips an older request once its publication is no longer current', async () => {
    const cache = memoryCache()
    const publication = await snapshot()
    const runWhileCurrentHeadLocked = vi.fn(async () => false)

    await expect(
      writeCurrentMyWorldFaqPublicCache(publication, {
        cache,
        runWhileCurrentHeadLocked,
      }),
    ).resolves.toBe('superseded')

    expect(runWhileCurrentHeadLocked).toHaveBeenCalledWith(publication.head, expect.any(Function))
    expect(cache.set).not.toHaveBeenCalled()
  })
})
