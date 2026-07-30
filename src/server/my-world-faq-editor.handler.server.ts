import { randomUUID } from 'node:crypto'
import { setResponseHeader } from '@tanstack/react-start/server'
import {
  assertMyWorldFaqEditorEnabled,
  assertMyWorldFaqEditorRequestTransport,
  clearMyWorldFaqEditorCookieHeader,
  MyWorldFaqEditorAuthError,
  type MyWorldFaqEditorSessionIdentity,
  myWorldFaqEditorCookieHeader,
  requireMyWorldFaqEditorSession,
  revokeMyWorldFaqEditorSessionFromRequest,
  unlockMyWorldFaqEditor,
} from '~/auth/my-world-faq-editor-session.server'
import {
  buildMyWorldFaqEditableFields,
  FAQ_EDITORIAL_FIELD_LIMITS,
  MY_WORLD_FAQ_SCHEMA_VERSION,
  prepareMyWorldFaqEditorialIntent,
} from '~/data/my-world-faq'
import {
  MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES,
  type MyWorldFaqEditorBaseSnapshot,
  type MyWorldFaqEditorLoaderData,
  type MyWorldFaqEditorSessionState,
  type PublishMyWorldFaqEditorResponse,
} from './my-world-faq-editor.functions'
import { writeCurrentMyWorldFaqPublicCache } from './my-world-faq-public-cache.server'
import {
  consumeMyWorldFaqEditorMutationPermit,
  loadMyWorldFaqEditorRevision,
  loadMyWorldFaqRevision,
  MyWorldFaqRepositoryError,
  type MyWorldFaqRevisionSnapshot,
  publishMyWorldFaqRevision,
} from './my-world-faq-repository.server'

export async function loadMyWorldFaqEditorHandler(
  request: Request,
): Promise<MyWorldFaqEditorLoaderData> {
  setProtectedEditorResponseHeaders()
  const session = await checkMyWorldFaqEditorSessionHandler(request)
  if (session.status !== 'ready') return session

  try {
    const revision = await loadMyWorldFaqEditorRevision()
    return {
      status: 'ready',
      identity: session.identity,
      base: {
        head: {
          revisionId: revision.revisionId,
          version: revision.version,
          digest: revision.digest,
        },
        document: revision.document,
        savedByName: revision.savedByName,
        createdAt: revision.createdAt,
      },
      manifest: {
        fields: buildMyWorldFaqEditableFields(revision.document),
        limits: FAQ_EDITORIAL_FIELD_LIMITS,
      },
    }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function checkMyWorldFaqEditorSessionHandler(
  request: Request,
): Promise<MyWorldFaqEditorSessionState> {
  setProtectedEditorResponseHeaders()
  try {
    assertMyWorldFaqEditorRequestTransport(request.url)
    const identity = await requireProtectedMyWorldFaqEditorSession(request)
    return {
      status: 'ready',
      identity: {
        displayName: identity.displayName,
        idleExpiresAt: identity.idleExpiresAt,
        absoluteExpiresAt: identity.absoluteExpiresAt,
      },
    }
  } catch (error) {
    if (error instanceof MyWorldFaqEditorAuthError && error.code === 'UNAUTHORIZED') {
      return { status: 'locked' }
    }
    return { status: 'unavailable' }
  }
}

function setProtectedEditorResponseHeaders(): void {
  setResponseHeader('Cache-Control', 'private, no-store')
  setResponseHeader('CDN-Cache-Control', 'no-store')
  setResponseHeader('Vercel-CDN-Cache-Control', 'no-store')
  setResponseHeader('Vary', 'Cookie')
}

export async function handleMyWorldFaqEditorUnlock(request: Request): Promise<Response> {
  try {
    assertMyWorldFaqEditorEnabled()
    assertMyWorldFaqEditorRequestTransport(request.url)
  } catch {
    emitFaqEditorSecurityEvent(request, {
      event: 'unlock',
      operation: 'session',
      outcome: 'disabled',
    })
    return privateJson(404, { ok: false, error: 'The FAQ editor is unavailable.' })
  }

  if (!isJsonRequest(request)) {
    return privateJson(415, { ok: false, error: 'Use application/json.' })
  }
  const body = await readStrictObject(request)
  if (
    !body ||
    Object.keys(body).sort().join(',') !== 'displayName,password' ||
    typeof body.password !== 'string' ||
    typeof body.displayName !== 'string'
  ) {
    return privateJson(400, { ok: false, error: 'Enter a display name and password.' })
  }

  try {
    const result = await unlockMyWorldFaqEditor({
      password: body.password,
      displayName: body.displayName,
    })
    emitFaqEditorSecurityEvent(request, {
      event: 'unlock',
      operation: 'session',
      outcome: 'success',
      sessionAuditId: result.identity.auditId,
    })
    return privateJson(
      200,
      {
        ok: true,
        displayName: result.identity.displayName,
        idleExpiresAt: result.identity.idleExpiresAt,
        absoluteExpiresAt: result.identity.absoluteExpiresAt,
      },
      {
        'Set-Cookie': myWorldFaqEditorCookieHeader(
          result.rawToken,
          result.absoluteExpiresAt,
          request.url,
        ),
      },
    )
  } catch (error) {
    if (error instanceof MyWorldFaqEditorAuthError) {
      const status =
        error.code === 'INVALID_DISPLAY_NAME'
          ? 400
          : error.code === 'INVALID_CREDENTIALS'
            ? 401
            : 503
      emitFaqEditorSecurityEvent(request, {
        event: 'unlock',
        operation: 'session',
        outcome: error.code === 'INVALID_CREDENTIALS' ? 'failure' : 'unavailable',
      })
      return privateJson(status, {
        ok: false,
        error:
          error.code === 'INVALID_DISPLAY_NAME'
            ? error.message
            : error.code === 'INVALID_CREDENTIALS'
              ? 'The password or session is not valid.'
              : 'The FAQ editor is unavailable.',
      })
    }
    return privateJson(503, { ok: false, error: 'The FAQ editor is unavailable.' })
  }
}

export async function handleMyWorldFaqEditorLogout(request: Request): Promise<Response> {
  const clearCookie = clearMyWorldFaqEditorCookieHeader(request.url)
  if (!isJsonRequest(request)) {
    return privateJson(
      415,
      { ok: false, error: 'Use application/json.' },
      { 'Set-Cookie': clearCookie },
    )
  }
  const body = await readStrictObject(request)
  if (!body || Object.keys(body).length > 0) {
    return privateJson(
      400,
      { ok: false, error: 'Invalid logout request.' },
      { 'Set-Cookie': clearCookie },
    )
  }
  try {
    const revoked = await revokeMyWorldFaqEditorSessionFromRequest(request)
    emitFaqEditorSecurityEvent(request, {
      event: 'session-revocation',
      operation: 'logout',
      outcome: revoked ? 'success' : 'no-session',
    })
    return new Response(null, {
      status: 204,
      headers: privateHeaders({ 'Set-Cookie': clearCookie }),
    })
  } catch {
    emitFaqEditorSecurityEvent(request, {
      event: 'session-revocation',
      operation: 'logout',
      outcome: 'unavailable',
    })
    return privateJson(
      503,
      { ok: false, error: 'The session could not be revoked right now.' },
      { 'Set-Cookie': clearCookie },
    )
  }
}

export async function handleMyWorldFaqEditorPublish(request: Request): Promise<Response> {
  let identity: MyWorldFaqEditorSessionIdentity
  try {
    assertMyWorldFaqEditorEnabled()
    assertMyWorldFaqEditorRequestTransport(request.url)
    identity = await requireProtectedMyWorldFaqEditorSession(request)
  } catch (error) {
    if (error instanceof MyWorldFaqEditorAuthError && error.code === 'UNAUTHORIZED') {
      return publishJson(401, {
        ok: false,
        error: 'session_expired',
        message: 'Your editor session has expired. Unlock the editor to try again.',
      })
    }
    return publishJson(404, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ editor is unavailable.',
    })
  }

  if (!isJsonRequest(request)) {
    return publishJson(415, {
      ok: false,
      error: 'invalid_body',
      message: 'Use application/json.',
    })
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return publishJson(400, {
        ok: false,
        error: 'invalid_body',
        message: 'The request body length is invalid.',
      })
    }
    if (Number(declaredLength) > MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES) {
      return publishJson(413, {
        ok: false,
        error: 'invalid_body',
        message: 'The FAQ draft is too large to publish.',
      })
    }
  }

  let permit: Awaited<ReturnType<typeof consumeMyWorldFaqEditorMutationPermit>>
  try {
    permit = await consumeMyWorldFaqEditorMutationPermit(identity.tokenDigest)
  } catch {
    return publishJson(503, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ could not be published right now. Your draft is unchanged.',
    })
  }
  if (!permit.allowed) {
    emitFaqEditorSecurityEvent(request, {
      event: 'mutation-limit',
      operation: 'publish',
      outcome: 'limited',
      sessionAuditId: identity.auditId,
    })
    return publishJson(
      429,
      {
        ok: false,
        error: 'rate_limited',
        message: 'Too many publish attempts. Wait ten minutes, then try again.',
      },
      { 'Retry-After': '600' },
    )
  }

  const body = await readStrictObject(request)
  const input = parsePublishRequest(body)
  if (!input) {
    return publishJson(400, {
      ok: false,
      error: 'invalid_body',
      message: 'The publish request is invalid. Your draft is unchanged.',
    })
  }

  let base: MyWorldFaqRevisionSnapshot
  try {
    base = await loadMyWorldFaqRevision(input.expectedBase.revisionId)
  } catch (error) {
    if (
      error instanceof MyWorldFaqRepositoryError &&
      (error.code === 'REVISION_NOT_FOUND' || error.code === 'STALE_HEAD')
    ) {
      return stalePublishResponse('stale_head')
    }
    return publishJson(503, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ could not be published right now. Your draft is unchanged.',
    })
  }

  if (!sameRevisionHead(base, input.expectedBase)) {
    return stalePublishResponse('stale_head')
  }

  const mutation = prepareMyWorldFaqEditorialIntent({
    base: base.document,
    submitted: input.document,
  })
  if (!mutation.success) {
    const noChanges = mutation.reason === 'no_op'
    return publishJson(422, {
      ok: false,
      error: noChanges ? 'no_changes' : 'validation_failed',
      message: noChanges
        ? 'There are no wording changes to publish.'
        : 'Some fields need attention before this FAQ can be published.',
      issues: mutation.issues,
      warnings: mutation.warnings,
    })
  }

  let publication: Awaited<ReturnType<typeof publishMyWorldFaqRevision>>
  try {
    publication = await publishMyWorldFaqRevision({
      document: input.document,
      expectedBase: input.expectedBase,
      attemptId: input.attemptId,
      savedByName: identity.displayName,
    })
  } catch (error) {
    if (error instanceof MyWorldFaqRepositoryError) {
      if (error.code === 'STALE_HEAD') return stalePublishResponse('stale_head')
      if (error.code === 'ATTEMPT_REUSED') return stalePublishResponse('attempt_reused')
      if (error.code === 'INVALID_DOCUMENT') {
        return publishJson(422, {
          ok: false,
          error: 'validation_failed',
          message: 'Some fields need attention before this FAQ can be published.',
          warnings: mutation.warnings,
        })
      }
    }
    emitFaqEditorSecurityEvent(request, {
      event: 'publish',
      operation: 'publish',
      outcome: 'unavailable',
      sessionAuditId: identity.auditId,
    })
    return publishJson(503, {
      ok: false,
      error: 'persistence_unavailable',
      message: 'The FAQ could not be published right now. Your draft is unchanged.',
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
        emitFaqEditorSecurityEvent(request, {
          event: 'publish',
          operation: 'publish',
          outcome: 'unavailable',
          sessionAuditId: identity.auditId,
          revisionVersion: publication.committed.version,
        })
        return publishJson(503, {
          ok: false,
          error: 'persistence_unavailable',
          message:
            'The change was saved, but the current FAQ could not be confirmed. Try publishing again to confirm it.',
        })
      }
    }
  } catch {
    resilience = 'degraded'
  }

  emitFaqEditorSecurityEvent(request, {
    event: 'publish',
    operation: 'publish',
    outcome: 'success',
    sessionAuditId: identity.auditId,
    revisionVersion: publication.committed.version,
  })
  return publishJson(200, {
    ok: true,
    outcome: publication.outcome,
    committed: editorBaseFromRevision(publication.committed),
    live: editorBaseFromRevision(publication.live),
    resilience,
    warnings: mutation.warnings,
  })

  async function stalePublishResponse(error: 'attempt_reused' | 'stale_head'): Promise<Response> {
    let latest: MyWorldFaqEditorBaseSnapshot | undefined
    try {
      latest = editorBaseFromRevision(await loadMyWorldFaqEditorRevision())
    } catch {
      latest = undefined
    }
    return publishJson(409, {
      ok: false,
      error,
      message:
        error === 'attempt_reused'
          ? 'This publish attempt no longer matches its original draft. Start a new attempt.'
          : 'Someone published a newer version. Compare it with your draft before continuing.',
      ...(latest ? { latest } : {}),
    })
  }
}

export async function requireProtectedMyWorldFaqEditorSession(
  request: Request,
): Promise<MyWorldFaqEditorSessionIdentity> {
  assertMyWorldFaqEditorEnabled()
  return requireMyWorldFaqEditorSession(request)
}

export function privateJson(
  status: number,
  body: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: privateHeaders(headers),
  })
}

export function privateHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('CDN-Cache-Control', 'no-store')
  headers.set('Vercel-CDN-Cache-Control', 'no-store')
  const existingVary = headers.get('Vary')
  const vary = new Set(
    (existingVary ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  vary.add('Cookie')
  headers.set('Vary', [...vary].join(', '))
  return headers
}

function publishJson(
  status: number,
  body: PublishMyWorldFaqEditorResponse,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: privateHeaders(headers),
  })
}

function parsePublishRequest(body: Record<string, unknown> | null): {
  schemaVersion: 1
  document: Record<string, unknown>
  expectedBase: {
    revisionId: string
    version: number
    digest: string
  }
  attemptId: string
} | null {
  if (!body || !hasExactKeys(body, ['attemptId', 'document', 'expectedBase', 'schemaVersion'])) {
    return null
  }
  if (body.schemaVersion !== MY_WORLD_FAQ_SCHEMA_VERSION) return null
  if (!isPlainRecord(body.document) || !isPlainRecord(body.expectedBase)) return null
  if (!hasExactKeys(body.expectedBase, ['digest', 'revisionId', 'version'])) return null
  if (
    typeof body.attemptId !== 'string' ||
    !isUuid(body.attemptId) ||
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
    document: body.document,
    expectedBase: {
      revisionId: body.expectedBase.revisionId,
      version: body.expectedBase.version as number,
      digest: body.expectedBase.digest,
    },
    attemptId: body.attemptId,
  }
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

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === [...expectedKeys].sort()[index])
  )
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
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

type SecurityEvent = {
  event: 'unlock' | 'session-revocation' | 'publish' | 'restore' | 'mutation-limit'
  operation: 'session' | 'logout' | 'publish' | 'restore'
  outcome: 'success' | 'failure' | 'disabled' | 'unavailable' | 'no-session' | 'limited'
  sessionAuditId?: string
  revisionVersion?: number
}

export function emitFaqEditorSecurityEvent(request: Request, event: SecurityEvent): void {
  const requestId =
    request.headers.get('x-vercel-id') ?? request.headers.get('x-request-id') ?? randomUUID()
  console.info('[my-world-faq-editor-security]', {
    event: event.event,
    operation: event.operation,
    outcome: event.outcome,
    requestId,
    sessionAuditId: event.sessionAuditId,
    revisionVersion: event.revisionVersion,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    deployment: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA,
  })
}
