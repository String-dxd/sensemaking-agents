import { randomUUID } from 'node:crypto'
import {
  assertMyWorldFaqEditorEnabled,
  clearMyWorldFaqEditorCookieHeader,
  MyWorldFaqEditorAuthError,
  type MyWorldFaqEditorSessionIdentity,
  myWorldFaqEditorCookieHeader,
  requireMyWorldFaqEditorSession,
  revokeMyWorldFaqEditorSessionFromRequest,
  unlockMyWorldFaqEditor,
} from '~/auth/my-world-faq-editor-session.server'

export async function handleMyWorldFaqEditorUnlock(request: Request): Promise<Response> {
  try {
    assertMyWorldFaqEditorEnabled()
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
