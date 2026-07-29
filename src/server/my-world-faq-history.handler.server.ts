import { randomUUID } from 'node:crypto'
import { setResponseHeader } from '@tanstack/react-start/server'
import {
  assertMyWorldFaqEditorEnabled,
  assertMyWorldFaqEditorRequestTransport,
  MyWorldFaqEditorAuthError,
  type MyWorldFaqEditorSessionIdentity,
  requireMyWorldFaqEditorSession,
} from '~/auth/my-world-faq-editor-session.server'
import {
  MY_WORLD_FAQ_SCHEMA_VERSION,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
  validateMyWorldFaqDocument,
} from '~/data/my-world-faq'
import type {
  LoadMyWorldFaqRevisionHistoryRequest,
  LoadMyWorldFaqRevisionPreviewRequest,
  MyWorldFaqEditorBaseSnapshot,
  MyWorldFaqRevisionHistoryData,
  MyWorldFaqRevisionPreviewData,
  RestoreMyWorldFaqEditorResponse,
} from './my-world-faq-editor.functions'
import { writeCurrentMyWorldFaqPublicCache } from './my-world-faq-public-cache.server'
import {
  consumeMyWorldFaqEditorMutationPermit,
  listMyWorldFaqRevisionMetadata,
  loadMyWorldFaqEditorRevision,
  loadMyWorldFaqRevision,
  MyWorldFaqRepositoryError,
  type MyWorldFaqRevisionMetadata,
  type MyWorldFaqRevisionSnapshot,
  publishMyWorldFaqRevision,
} from './my-world-faq-repository.server'

export async function loadMyWorldFaqRevisionHistoryHandler(
  request: Request,
  input: LoadMyWorldFaqRevisionHistoryRequest,
): Promise<MyWorldFaqRevisionHistoryData> {
  setProtectedEditorResponseHeaders()
  const session = await resolveProtectedSession(request)
  if (session.status !== 'ready') return session

  try {
    const page = await listMyWorldFaqRevisionMetadata(input)
    return {
      status: 'ready',
      items: page.items.map(historyMetadataFromRevision),
      nextBeforeVersion: page.nextBeforeVersion,
    }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function loadMyWorldFaqRevisionPreviewHandler(
  request: Request,
  input: LoadMyWorldFaqRevisionPreviewRequest,
): Promise<MyWorldFaqRevisionPreviewData> {
  setProtectedEditorResponseHeaders()
  const session = await resolveProtectedSession(request)
  if (session.status !== 'ready') return session
  if (!isUuid(input.revisionId)) return { status: 'unsupported' }

  try {
    // Deliberately load only the selected row. History listing never hydrates
    // document bodies, and preview never fans out across revision IDs.
    const revision = await loadMyWorldFaqRevision(input.revisionId)
    if (!isSupportedRevision(revision)) return { status: 'unsupported' }
    return {
      status: 'ready',
      revision: {
        ...editorBaseFromRevision(revision),
        schemaVersion: revision.schemaVersion,
        structureVersion: revision.structureVersion,
        attributionKind: revision.attributionKind,
        restoredFromRevisionId: revision.restoredFromRevisionId,
      },
    }
  } catch (error) {
    // Missing and corrupt rows stay behind the protected boundary and expose
    // no repository details. Operational failures use the same generic
    // unavailable state as the rest of the protected editor.
    if (
      error instanceof MyWorldFaqRepositoryError &&
      (error.code === 'REVISION_NOT_FOUND' ||
        error.code === 'CORRUPT_STATE' ||
        error.code === 'INVALID_DOCUMENT')
    ) {
      return { status: 'unsupported' }
    }
    return { status: 'unavailable' }
  }
}

export async function handleMyWorldFaqEditorRestore(request: Request): Promise<Response> {
  let identity: MyWorldFaqEditorSessionIdentity
  try {
    identity = await requireProtectedSession(request)
  } catch (error) {
    if (error instanceof MyWorldFaqEditorAuthError && error.code === 'UNAUTHORIZED') {
      return restoreJson(401, {
        ok: false,
        error: 'session_expired',
        message: 'Your editor session has expired. Unlock the editor to try again.',
      })
    }
    return restoreJson(404, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ editor is unavailable.',
    })
  }

  let permit: Awaited<ReturnType<typeof consumeMyWorldFaqEditorMutationPermit>>
  try {
    // The database-backed permit is intentionally consumed before any body
    // parsing, matching the publish boundary and protecting malformed retries.
    permit = await consumeMyWorldFaqEditorMutationPermit(identity.tokenDigest)
  } catch {
    return restoreJson(503, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ could not be restored right now.',
    })
  }
  if (!permit.allowed) {
    emitRestoreSecurityEvent(request, {
      outcome: 'limited',
      sessionAuditId: identity.auditId,
    })
    return restoreJson(
      429,
      {
        ok: false,
        error: 'rate_limited',
        message: 'Too many restore attempts. Wait ten minutes, then try again.',
      },
      { 'Retry-After': '600' },
    )
  }

  if (!isJsonRequest(request)) {
    return restoreJson(415, {
      ok: false,
      error: 'invalid_body',
      message: 'Use application/json.',
    })
  }

  const input = parseRestoreRequest(await readStrictObject(request))
  if (!input) {
    return restoreJson(400, {
      ok: false,
      error: 'invalid_body',
      message: 'The restore request is invalid.',
    })
  }

  let current: MyWorldFaqRevisionSnapshot
  try {
    current = await loadMyWorldFaqEditorRevision()
  } catch {
    return restoreJson(503, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ could not be restored right now.',
    })
  }
  const baseIsStillCurrent = sameRevisionHead(current, input.expectedBase)

  let target: MyWorldFaqRevisionSnapshot
  try {
    target = await loadMyWorldFaqRevision(input.targetRevisionId)
    if (!isSupportedRevision(target)) {
      return unavailableRevisionResponse()
    }
  } catch (error) {
    if (
      error instanceof MyWorldFaqRepositoryError &&
      (error.code === 'REVISION_NOT_FOUND' ||
        error.code === 'CORRUPT_STATE' ||
        error.code === 'INVALID_DOCUMENT')
    ) {
      return unavailableRevisionResponse()
    }
    return restoreJson(503, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ could not be restored right now.',
    })
  }

  if (
    baseIsStillCurrent &&
    (target.revisionId === current.revisionId || target.digest === current.digest)
  ) {
    return restoreJson(422, {
      ok: false,
      error: 'no_changes',
      message: 'That revision is already the current FAQ.',
    })
  }

  let publication: Awaited<ReturnType<typeof publishMyWorldFaqRevision>>
  try {
    publication = await publishMyWorldFaqRevision({
      document: target.document,
      expectedBase: input.expectedBase,
      attemptId: input.attemptId,
      savedByName: identity.displayName,
      restoredFromRevisionId: target.revisionId,
    })
  } catch (error) {
    if (error instanceof MyWorldFaqRepositoryError) {
      if (error.code === 'STALE_HEAD') return staleRestoreResponse('stale_head')
      if (error.code === 'ATTEMPT_REUSED') return staleRestoreResponse('attempt_reused')
      if (
        error.code === 'REVISION_NOT_FOUND' ||
        error.code === 'RESTORE_MISMATCH' ||
        error.code === 'INVALID_DOCUMENT' ||
        error.code === 'CORRUPT_STATE'
      ) {
        return unavailableRevisionResponse()
      }
    }
    emitRestoreSecurityEvent(request, {
      outcome: 'unavailable',
      sessionAuditId: identity.auditId,
    })
    return restoreJson(503, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ could not be restored right now.',
    })
  }

  let resilience: 'healthy' | 'degraded' = 'healthy'
  try {
    const cacheResult = await writeCurrentMyWorldFaqPublicCache(
      publicSnapshotFromRevision(publication.live),
    )
    if (cacheResult === 'busy') {
      resilience = 'degraded'
    } else if (cacheResult === 'superseded') {
      try {
        const live = await loadMyWorldFaqEditorRevision()
        publication = {
          outcome: 'committed-but-superseded',
          committed: publication.committed,
          live,
        }
      } catch {
        emitRestoreSecurityEvent(request, {
          outcome: 'unavailable',
          sessionAuditId: identity.auditId,
          revisionVersion: publication.committed.version,
        })
        return restoreJson(503, {
          ok: false,
          error: 'persistence_unavailable',
          message:
            'The restore was saved, but the current FAQ could not be confirmed. Try restoring again to confirm it.',
        })
      }
    }
  } catch {
    resilience = 'degraded'
  }

  emitRestoreSecurityEvent(request, {
    outcome: 'success',
    sessionAuditId: identity.auditId,
    revisionVersion: publication.committed.version,
  })
  return restoreJson(200, {
    ok: true,
    outcome: publication.outcome,
    committed: editorBaseFromRevision(publication.committed),
    live: editorBaseFromRevision(publication.live),
    resilience,
  })

  function unavailableRevisionResponse(): Response {
    return restoreJson(422, {
      ok: false,
      error: 'revision_unavailable',
      message: 'The selected revision cannot be restored.',
    })
  }

  async function staleRestoreResponse(
    error: 'attempt_reused' | 'stale_head',
    knownLatest?: MyWorldFaqRevisionSnapshot,
  ): Promise<Response> {
    let latest = knownLatest
    if (!latest) {
      try {
        latest = await loadMyWorldFaqEditorRevision()
      } catch {
        latest = undefined
      }
    }
    return restoreJson(409, {
      ok: false,
      error,
      message:
        error === 'attempt_reused'
          ? 'This restore attempt no longer matches its original request.'
          : 'Someone published a newer version. Reload the current FAQ before restoring.',
      ...(latest ? { latest: editorBaseFromRevision(latest) } : {}),
    })
  }
}

async function resolveProtectedSession(
  request: Request,
): Promise<
  | { status: 'locked' }
  | { status: 'unavailable' }
  | { status: 'ready'; identity: MyWorldFaqEditorSessionIdentity }
> {
  try {
    return { status: 'ready', identity: await requireProtectedSession(request) }
  } catch (error) {
    if (error instanceof MyWorldFaqEditorAuthError && error.code === 'UNAUTHORIZED') {
      return { status: 'locked' }
    }
    return { status: 'unavailable' }
  }
}

async function requireProtectedSession(request: Request): Promise<MyWorldFaqEditorSessionIdentity> {
  assertMyWorldFaqEditorEnabled()
  assertMyWorldFaqEditorRequestTransport(request.url)
  return requireMyWorldFaqEditorSession(request)
}

function setProtectedEditorResponseHeaders(): void {
  setResponseHeader('Cache-Control', 'private, no-store')
  setResponseHeader('CDN-Cache-Control', 'no-store')
  setResponseHeader('Vercel-CDN-Cache-Control', 'no-store')
  setResponseHeader('Vary', 'Cookie')
}

function historyMetadataFromRevision(
  revision: MyWorldFaqRevisionMetadata,
): MyWorldFaqRevisionMetadata {
  return {
    revisionId: revision.revisionId,
    version: revision.version,
    digest: revision.digest,
    schemaVersion: revision.schemaVersion,
    structureVersion: revision.structureVersion,
    attributionKind: revision.attributionKind,
    savedByName: revision.savedByName,
    createdAt: revision.createdAt,
    restoredFromRevisionId: revision.restoredFromRevisionId,
  }
}

function isSupportedRevision(revision: MyWorldFaqRevisionSnapshot): boolean {
  if (
    revision.schemaVersion !== MY_WORLD_FAQ_SCHEMA_VERSION ||
    revision.structureVersion !== MY_WORLD_FAQ_STRUCTURE_VERSION
  ) {
    return false
  }
  return validateMyWorldFaqDocument(revision.document).success
}

function sameRevisionHead(
  revision: MyWorldFaqRevisionSnapshot,
  expected: { revisionId: string; version: number; digest: string },
): boolean {
  return (
    revision.revisionId === expected.revisionId &&
    revision.version === expected.version &&
    revision.digest === expected.digest
  )
}

function editorBaseFromRevision(
  revision: MyWorldFaqRevisionSnapshot,
): MyWorldFaqEditorBaseSnapshot {
  return {
    head: {
      revisionId: revision.revisionId,
      version: revision.version,
      digest: revision.digest,
    },
    document: revision.document,
    savedByName: revision.savedByName,
    createdAt: revision.createdAt,
  }
}

function publicSnapshotFromRevision(revision: MyWorldFaqRevisionSnapshot) {
  return {
    head: {
      revisionId: revision.revisionId,
      version: revision.version,
      digest: revision.digest,
    },
    schemaVersion: revision.schemaVersion,
    structureVersion: revision.structureVersion,
    document: revision.document,
  }
}

function parseRestoreRequest(body: Record<string, unknown> | null): {
  schemaVersion: 1
  targetRevisionId: string
  expectedBase: {
    revisionId: string
    version: number
    digest: string
  }
  attemptId: string
} | null {
  if (
    !body ||
    !hasExactKeys(body, ['attemptId', 'expectedBase', 'schemaVersion', 'targetRevisionId']) ||
    body.schemaVersion !== MY_WORLD_FAQ_SCHEMA_VERSION ||
    typeof body.targetRevisionId !== 'string' ||
    !isUuid(body.targetRevisionId) ||
    typeof body.attemptId !== 'string' ||
    !isUuid(body.attemptId) ||
    !isPlainRecord(body.expectedBase) ||
    !hasExactKeys(body.expectedBase, ['digest', 'revisionId', 'version']) ||
    typeof body.expectedBase.revisionId !== 'string' ||
    !isUuid(body.expectedBase.revisionId) ||
    !Number.isInteger(body.expectedBase.version) ||
    (body.expectedBase.version as number) < 1 ||
    typeof body.expectedBase.digest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(body.expectedBase.digest)
  ) {
    return null
  }
  return {
    schemaVersion: MY_WORLD_FAQ_SCHEMA_VERSION,
    targetRevisionId: body.targetRevisionId,
    expectedBase: {
      revisionId: body.expectedBase.revisionId,
      version: body.expectedBase.version as number,
      digest: body.expectedBase.digest,
    },
    attemptId: body.attemptId,
  }
}

function restoreJson(
  status: number,
  body: RestoreMyWorldFaqEditorResponse,
  initialHeaders?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: privateHeaders(initialHeaders),
  })
}

function privateHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('CDN-Cache-Control', 'no-store')
  headers.set('Vercel-CDN-Cache-Control', 'no-store')
  const vary = new Set(
    (headers.get('Vary') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  vary.add('Cookie')
  headers.set('Vary', [...vary].join(', '))
  return headers
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function readStrictObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return isPlainRecord(value) ? value : null
  } catch {
    return null
  }
}

function isJsonRequest(request: Request): boolean {
  return (
    request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ===
    'application/json'
  )
}

function emitRestoreSecurityEvent(
  request: Request,
  event: {
    outcome: 'success' | 'unavailable' | 'limited'
    sessionAuditId: string
    revisionVersion?: number
  },
): void {
  const requestId =
    request.headers.get('x-vercel-id') ?? request.headers.get('x-request-id') ?? randomUUID()
  console.info('[my-world-faq-editor-security]', {
    event: event.outcome === 'limited' ? 'mutation-limit' : 'restore',
    operation: 'restore',
    outcome: event.outcome,
    requestId,
    sessionAuditId: event.sessionAuditId,
    revisionVersion: event.revisionVersion,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    deployment: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA,
  })
}
