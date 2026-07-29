import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MY_WORLD_FAQ_CONTENT, digestMyWorldFaqDocument } from '~/data/my-world-faq'
import {
  createMyWorldFaqContentHandler,
  MY_WORLD_FAQ_UNAVAILABLE_MESSAGE,
  type MyWorldFaqContentHandlerDependencies,
  parseMyWorldFaqContentSource,
} from '~/server/my-world-faq-content.handler.server'
import { publicCacheEnvelopeFromSnapshot } from '~/server/my-world-faq-public-cache.server'
import type { MyWorldFaqPublicSnapshot } from '~/server/my-world-faq-repository.server'

const REVISION_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
] as const

async function snapshot(
  content = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT),
  version = 1,
): Promise<MyWorldFaqPublicSnapshot> {
  return {
    head: {
      revisionId: REVISION_IDS[version - 1] ?? REVISION_IDS[0],
      version,
      digest: await digestMyWorldFaqDocument(content),
    },
    schemaVersion: content.schemaVersion,
    structureVersion: content.structureVersion,
    document: content,
  }
}

function dependencies(
  overrides: Partial<MyWorldFaqContentHandlerDependencies> = {},
): MyWorldFaqContentHandlerDependencies {
  return {
    readContentSource: vi.fn(() => 'compiled'),
    loadDatabaseSnapshot: vi.fn(async () => snapshot()),
    readPublicCache: vi.fn(async () => null),
    writePublicCache: vi.fn(async () => {}),
    setHeader: vi.fn(),
    setStatus: vi.fn(),
    logOperationalEvent: vi.fn(),
    ...overrides,
  }
}

function expectFreshnessHeader(
  deps: MyWorldFaqContentHandlerDependencies,
  freshness: 'current' | 'degraded',
) {
  expect(deps.setHeader).toHaveBeenCalledWith('X-My-World-FAQ-Freshness', freshness)
}

describe('My World FAQ public content handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts only the two explicit content-source values', () => {
    expect(parseMyWorldFaqContentSource(undefined)).toBe('compiled')
    expect(parseMyWorldFaqContentSource('compiled')).toBe('compiled')
    expect(parseMyWorldFaqContentSource('database')).toBe('database')
    expect(() => parseMyWorldFaqContentSource('')).toThrow()
    expect(() => parseMyWorldFaqContentSource('DATABASE')).toThrow()
    expect(() => parseMyWorldFaqContentSource('cache')).toThrow()
  })

  it('uses the validated compiled publication without touching Postgres or cache', async () => {
    const deps = dependencies()

    await expect(createMyWorldFaqContentHandler(deps)()).resolves.toEqual(
      DEFAULT_MY_WORLD_FAQ_CONTENT,
    )
    expect(deps.loadDatabaseSnapshot).not.toHaveBeenCalled()
    expect(deps.readPublicCache).not.toHaveBeenCalled()
    expect(deps.writePublicCache).not.toHaveBeenCalled()
    expectFreshnessHeader(deps, 'current')
  })

  it('reads Postgres first in database mode and refreshes the public-only cache', async () => {
    const publication = await snapshot()
    publication.document.page.hero.heading = 'Published from Postgres'
    publication.head.digest = await digestMyWorldFaqDocument(publication.document)
    const deps = dependencies({
      readContentSource: () => 'database',
      loadDatabaseSnapshot: vi.fn(async () => publication),
    })

    const content = await createMyWorldFaqContentHandler(deps)()

    expect(content.page.hero.heading).toBe('Published from Postgres')
    expect(deps.loadDatabaseSnapshot).toHaveBeenCalledTimes(1)
    expect(deps.readPublicCache).not.toHaveBeenCalled()
    expect(deps.writePublicCache).toHaveBeenCalledWith(publication)
    expectFreshnessHeader(deps, 'current')
  })

  it('serves a validated authored last-known-good snapshot when Postgres fails', async () => {
    const cachedPublication = await snapshot()
    cachedPublication.document.page.hero.heading = 'Prior authored publication'
    cachedPublication.head.digest = await digestMyWorldFaqDocument(cachedPublication.document)
    const cached = await publicCacheEnvelopeFromSnapshot(cachedPublication)
    const deps = dependencies({
      readContentSource: () => 'database',
      loadDatabaseSnapshot: vi.fn(async () => {
        throw Object.assign(new Error('private database detail'), {
          code: 'DATABASE_UNAVAILABLE',
        })
      }),
      readPublicCache: vi.fn(async () => cached),
    })

    const content = await createMyWorldFaqContentHandler(deps)()

    expect(content.page.hero.heading).toBe('Prior authored publication')
    expect(content.page.hero.heading).not.toBe(DEFAULT_MY_WORLD_FAQ_CONTENT.page.hero.heading)
    expectFreshnessHeader(deps, 'degraded')
    expect(deps.logOperationalEvent).toHaveBeenCalledWith(
      'public_content_served_from_last_known_good',
      {
        contentSource: 'database',
        databaseFailure: 'database_unavailable',
        freshness: 'degraded',
      },
    )
  })

  it('fails with a sanitized 503 instead of compiled copy when database and cache fail', async () => {
    const deps = dependencies({
      readContentSource: () => 'database',
      loadDatabaseSnapshot: vi.fn(async () => {
        throw new Error('DATABASE_URL=postgres://private-host/raw-sql-failure')
      }),
      readPublicCache: vi.fn(async () => null),
    })

    await expect(createMyWorldFaqContentHandler(deps)()).rejects.toThrow(
      MY_WORLD_FAQ_UNAVAILABLE_MESSAGE,
    )
    expect(deps.setStatus).toHaveBeenCalledWith(503)
    expect(deps.writePublicCache).not.toHaveBeenCalled()
    expect(
      JSON.stringify((deps.logOperationalEvent as ReturnType<typeof vi.fn>).mock.calls),
    ).not.toContain('private-host')
  })

  it('fails closed on an unknown deployment mode without reading database or cache', async () => {
    const deps = dependencies({ readContentSource: () => 'typo' })

    await expect(createMyWorldFaqContentHandler(deps)()).rejects.toThrow(
      MY_WORLD_FAQ_UNAVAILABLE_MESSAGE,
    )
    expect(deps.setStatus).toHaveBeenCalledWith(503)
    expect(deps.loadDatabaseSnapshot).not.toHaveBeenCalled()
    expect(deps.readPublicCache).not.toHaveBeenCalled()
  })

  it('keeps database content live when refreshing resilience cache fails', async () => {
    const publication = await snapshot()
    const deps = dependencies({
      readContentSource: () => 'database',
      loadDatabaseSnapshot: vi.fn(async () => publication),
      writePublicCache: vi.fn(async () => {
        throw new Error('cache unavailable')
      }),
    })

    await expect(createMyWorldFaqContentHandler(deps)()).resolves.toEqual(publication.document)
    expectFreshnessHeader(deps, 'current')
    expect(deps.logOperationalEvent).toHaveBeenCalledWith('public_cache_refresh_failed', {
      contentSource: 'database',
      freshness: 'current',
    })
  })

  it('does not let a prior request or a cookie-shaped input make a newer head stale', async () => {
    const firstContent = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    firstContent.page.hero.heading = 'Revision one'
    const secondContent = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    secondContent.page.hero.heading = 'Revision two'
    const publications = [await snapshot(firstContent, 1), await snapshot(secondContent, 2)]
    const loadDatabaseSnapshot = vi
      .fn<() => Promise<MyWorldFaqPublicSnapshot>>()
      .mockResolvedValueOnce(publications[0] as MyWorldFaqPublicSnapshot)
      .mockResolvedValueOnce(publications[1] as MyWorldFaqPublicSnapshot)
    const deps = dependencies({
      readContentSource: () => 'database',
      loadDatabaseSnapshot,
    })
    const handler = createMyWorldFaqContentHandler(deps)

    const first = await handler()
    const second = await handler()

    expect(first.page.hero.heading).toBe('Revision one')
    expect(second.page.hero.heading).toBe('Revision two')
    expect(loadDatabaseSnapshot).toHaveBeenCalledTimes(2)
  })

  it('sets browser and CDN revalidation headers on every success mode', async () => {
    for (const mode of ['compiled', 'database'] as const) {
      const deps = dependencies({ readContentSource: () => mode })
      await createMyWorldFaqContentHandler(deps)()

      expect(deps.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, max-age=0, must-revalidate',
      )
      expect(deps.setHeader).toHaveBeenCalledWith('CDN-Cache-Control', 'no-store')
      expect(deps.setHeader).toHaveBeenCalledWith('Vercel-CDN-Cache-Control', 'no-store')
    }
  })
})
