import { getCache, type RuntimeCache } from '@vercel/functions'
import {
  composeMyWorldFaqDocument,
  digestMyWorldFaqDocument,
  MY_WORLD_FAQ_SCHEMA_VERSION,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
  type MyWorldFaqContent,
} from '~/data/my-world-faq'
import {
  type MyWorldFaqHeadRef,
  type MyWorldFaqPublicSnapshot,
  runWhileCurrentMyWorldFaqHeadLocked,
} from './my-world-faq-repository.server'

const PUBLIC_CACHE_ENVELOPE_VERSION = 1 as const
const PUBLIC_CACHE_KEY = 'public-last-known-good-v1'
const PUBLIC_CACHE_TAG = 'my-world-faq-public'
const PUBLIC_CACHE_KEYS = [
  'cacheEnvelopeVersion',
  'pageKey',
  'revisionId',
  'revisionVersion',
  'documentDigest',
  'schemaVersion',
  'structureVersion',
  'content',
] as const

export interface MyWorldFaqPublicCacheEnvelope {
  cacheEnvelopeVersion: typeof PUBLIC_CACHE_ENVELOPE_VERSION
  pageKey: 'my-world-faq'
  revisionId: string
  revisionVersion: number
  documentDigest: string
  schemaVersion: number
  structureVersion: number
  content: MyWorldFaqContent
}

let runtimeCache: RuntimeCache | null = null

function getRuntimeCache(): RuntimeCache {
  runtimeCache ??= getCache({ namespace: 'my-world-faq' })
  return runtimeCache
}

/**
 * Store only the public document plus the minimum immutable-head fields needed
 * to prove that a cache hit is a complete, untampered publication.
 */
export async function writeMyWorldFaqPublicCache(
  snapshot: MyWorldFaqPublicSnapshot,
  cache: RuntimeCache = getRuntimeCache(),
): Promise<void> {
  const envelope = await publicCacheEnvelopeFromSnapshot(snapshot)
  await cache.set(PUBLIC_CACHE_KEY, envelope, {
    name: 'My World FAQ public last-known-good',
    tags: [PUBLIC_CACHE_TAG],
  })
}

/**
 * Serialize the derived cache write with the authoritative singleton head.
 * If a newer publication is already live, the older request is skipped. If a
 * publication is waiting, it cannot advance until this write completes, so a
 * stale request can never land after the newer cache entry.
 */
export async function writeCurrentMyWorldFaqPublicCache(
  snapshot: MyWorldFaqPublicSnapshot,
  options: {
    cache?: RuntimeCache
    runWhileCurrentHeadLocked?: (
      expectedHead: MyWorldFaqHeadRef,
      operation: () => Promise<void>,
    ) => Promise<boolean>
  } = {},
): Promise<'written' | 'superseded'> {
  const runWhileCurrentHeadLocked =
    options.runWhileCurrentHeadLocked ?? runWhileCurrentMyWorldFaqHeadLocked
  const written = await runWhileCurrentHeadLocked(snapshot.head, () =>
    writeMyWorldFaqPublicCache(snapshot, options.cache ?? getRuntimeCache()),
  )
  return written ? 'written' : 'superseded'
}

/**
 * A malformed, incompatible or integrity-mismatched entry is a miss. Callers
 * may use it only after the authoritative Postgres read has failed.
 */
export async function readMyWorldFaqPublicCache(
  cache: RuntimeCache = getRuntimeCache(),
): Promise<MyWorldFaqPublicCacheEnvelope | null> {
  const candidate = await cache.get(PUBLIC_CACHE_KEY)
  return validatePublicCacheEnvelope(candidate)
}

export async function publicCacheEnvelopeFromSnapshot(
  snapshot: MyWorldFaqPublicSnapshot,
): Promise<MyWorldFaqPublicCacheEnvelope> {
  const content = composeMyWorldFaqDocument(snapshot.document)
  const documentDigest = await digestMyWorldFaqDocument(content)
  if (
    snapshot.head.digest !== documentDigest ||
    snapshot.schemaVersion !== content.schemaVersion ||
    snapshot.structureVersion !== content.structureVersion ||
    !isUuid(snapshot.head.revisionId) ||
    !Number.isInteger(snapshot.head.version) ||
    snapshot.head.version < 1
  ) {
    throw new Error('Cannot cache an invalid My World FAQ publication.')
  }

  return {
    cacheEnvelopeVersion: PUBLIC_CACHE_ENVELOPE_VERSION,
    pageKey: 'my-world-faq',
    revisionId: snapshot.head.revisionId,
    revisionVersion: snapshot.head.version,
    documentDigest,
    schemaVersion: snapshot.schemaVersion,
    structureVersion: snapshot.structureVersion,
    content,
  }
}

export async function validatePublicCacheEnvelope(
  candidate: unknown,
): Promise<MyWorldFaqPublicCacheEnvelope | null> {
  if (!isExactRecord(candidate, PUBLIC_CACHE_KEYS)) return null
  if (
    candidate.cacheEnvelopeVersion !== PUBLIC_CACHE_ENVELOPE_VERSION ||
    candidate.pageKey !== 'my-world-faq' ||
    !isUuid(candidate.revisionId) ||
    !Number.isInteger(candidate.revisionVersion) ||
    (candidate.revisionVersion as number) < 1 ||
    typeof candidate.documentDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(candidate.documentDigest) ||
    candidate.schemaVersion !== MY_WORLD_FAQ_SCHEMA_VERSION ||
    candidate.structureVersion !== MY_WORLD_FAQ_STRUCTURE_VERSION
  ) {
    return null
  }

  let content: MyWorldFaqContent
  try {
    content = composeMyWorldFaqDocument(candidate.content)
  } catch {
    return null
  }
  if (
    content.schemaVersion !== candidate.schemaVersion ||
    content.structureVersion !== candidate.structureVersion
  ) {
    return null
  }

  const digest = await digestMyWorldFaqDocument(content)
  if (digest !== candidate.documentDigest) return null

  return {
    cacheEnvelopeVersion: PUBLIC_CACHE_ENVELOPE_VERSION,
    pageKey: 'my-world-faq',
    revisionId: candidate.revisionId as string,
    revisionVersion: candidate.revisionVersion as number,
    documentDigest: candidate.documentDigest,
    schemaVersion: candidate.schemaVersion,
    structureVersion: candidate.structureVersion,
    content,
  }
}

function isExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => expectedKeys.includes(key)) &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  )
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}
