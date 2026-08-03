import { setResponseHeader, setResponseStatus } from '@tanstack/react-start/server'
import { waitUntil } from '@vercel/functions'
import {
  composeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_DOCUMENT,
  type MyWorldFaqContent,
} from '~/data/my-world-faq'
import {
  type MyWorldFaqPublicCacheEnvelope,
  readMyWorldFaqPublicCache,
  writeCurrentMyWorldFaqPublicCache,
} from './my-world-faq-public-cache.server'
import {
  loadCurrentMyWorldFaqRevision,
  type MyWorldFaqPublicSnapshot,
} from './my-world-faq-repository.server'

export const MY_WORLD_FAQ_UNAVAILABLE_MESSAGE =
  'The FAQ is temporarily unavailable. Please try again in a moment.'

export type MyWorldFaqContentSource = 'compiled' | 'database'
export type MyWorldFaqPublicFreshness = 'current' | 'degraded'

export interface MyWorldFaqContentHandlerDependencies {
  readContentSource: () => string | undefined
  loadDatabaseSnapshot: () => Promise<MyWorldFaqPublicSnapshot>
  readPublicCache: () => Promise<MyWorldFaqPublicCacheEnvelope | null>
  schedulePublicCacheRefresh: (snapshot: MyWorldFaqPublicSnapshot, onFailure: () => void) => void
  setHeader: (name: string, value: string) => void
  setStatus: (status: number) => void
  logOperationalEvent: (
    event: string,
    fields: Readonly<Record<string, string | number | boolean>>,
  ) => void
}

export function parseMyWorldFaqContentSource(value: string | undefined): MyWorldFaqContentSource {
  if (value === undefined) return 'compiled'
  if (value === 'compiled' || value === 'database') return value
  throw new Error('Invalid My World FAQ content source configuration.')
}

export function createMyWorldFaqContentHandler(
  dependencies: MyWorldFaqContentHandlerDependencies,
): () => Promise<MyWorldFaqContent> {
  return async () => {
    setRevalidationHeaders(dependencies.setHeader)

    let source: MyWorldFaqContentSource
    try {
      source = parseMyWorldFaqContentSource(dependencies.readContentSource())
    } catch {
      return unavailable(dependencies, 'invalid_content_source', 'configuration')
    }

    if (source === 'compiled') {
      dependencies.setHeader('X-My-World-FAQ-Freshness', 'current')
      return composeMyWorldFaqDocument(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    }

    let snapshot: MyWorldFaqPublicSnapshot
    try {
      snapshot = await dependencies.loadDatabaseSnapshot()
    } catch (error) {
      return loadDegradedOrUnavailable(dependencies, repositoryFailureCategory(error))
    }

    const content = composeMyWorldFaqDocument(snapshot.document)
    dependencies.setHeader('X-My-World-FAQ-Freshness', 'current')
    try {
      dependencies.schedulePublicCacheRefresh(snapshot, () => {
        dependencies.logOperationalEvent('public_cache_refresh_failed', {
          contentSource: 'database',
          freshness: 'current',
        })
      })
    } catch {
      dependencies.logOperationalEvent('public_cache_refresh_failed', {
        contentSource: 'database',
        freshness: 'current',
      })
    }
    return content
  }
}

export const loadMyWorldFaqContentHandler = createMyWorldFaqContentHandler({
  readContentSource: () => process.env.MY_WORLD_FAQ_CONTENT_SOURCE,
  loadDatabaseSnapshot: loadCurrentMyWorldFaqRevision,
  readPublicCache: readMyWorldFaqPublicCache,
  schedulePublicCacheRefresh: (snapshot, onFailure) => {
    waitUntil(writeCurrentMyWorldFaqPublicCache(snapshot).catch(onFailure))
  },
  setHeader: setResponseHeader,
  setStatus: setResponseStatus,
  logOperationalEvent: (event, fields) => {
    // Only fixed event names and redacted enums/counts are permitted here.
    // Never attach the originating Error, DATABASE_URL, document or cookies.
    console.warn('[my-world-faq/public]', { event, ...fields })
  },
})

async function loadDegradedOrUnavailable(
  dependencies: MyWorldFaqContentHandlerDependencies,
  failureCategory: string,
): Promise<MyWorldFaqContent> {
  let cached: MyWorldFaqPublicCacheEnvelope | null = null
  try {
    cached = await dependencies.readPublicCache()
  } catch {
    // Treat cache transport failure like a miss. The public response remains
    // generic and the operational event below is intentionally redacted.
  }

  if (cached) {
    dependencies.setHeader('X-My-World-FAQ-Freshness', 'degraded')
    dependencies.logOperationalEvent('public_content_served_from_last_known_good', {
      contentSource: 'database',
      databaseFailure: failureCategory,
      freshness: 'degraded',
    })
    return cached.content
  }

  return unavailable(dependencies, 'public_content_unavailable', failureCategory)
}

function unavailable(
  dependencies: MyWorldFaqContentHandlerDependencies,
  event: string,
  failureCategory: string,
): never {
  dependencies.setStatus(503)
  dependencies.logOperationalEvent(event, {
    contentSource: 'database',
    databaseFailure: failureCategory,
  })
  throw new Error(MY_WORLD_FAQ_UNAVAILABLE_MESSAGE)
}

function setRevalidationHeaders(setHeader: (name: string, value: string) => void) {
  setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate')
  setHeader('CDN-Cache-Control', 'no-store')
  setHeader('Vercel-CDN-Cache-Control', 'no-store')
}

function repositoryFailureCategory(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'unexpected'
  const code = String((error as { code: unknown }).code)
  return REPOSITORY_FAILURE_CODES.has(code) ? code.toLowerCase() : 'unexpected'
}

const REPOSITORY_FAILURE_CODES = new Set([
  'UNINITIALIZED',
  'CORRUPT_STATE',
  'DATABASE_UNAVAILABLE',
  'PERSISTENCE_FAILED',
])
