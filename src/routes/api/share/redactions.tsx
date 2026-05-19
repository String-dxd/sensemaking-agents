import { createFileRoute } from '@tanstack/react-router'

import { UnauthenticatedError } from '~/auth/identity'
import {
  ShareDemoUnsupportedError,
  ShareUnknownStudentError,
  setShareRedactionsHandler,
} from '~/server/share-token.handler.server'

export const Route = createFileRoute('/api/share/redactions')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
})

async function handle(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonError(403, 'cross_origin', 'Share-redactions must originate from this site.')
  }
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Request body must be valid JSON.')
  }

  try {
    const result = await setShareRedactionsHandler(body as never)
    return Response.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof ShareDemoUnsupportedError) {
      return jsonError(403, err.code, err.message)
    }
    if (err instanceof ShareUnknownStudentError) {
      return jsonError(422, err.code, err.message)
    }
    if (err instanceof UnauthenticatedError) {
      return jsonError(401, 'unauthenticated', err.message)
    }
    if (isZodValidationError(err)) {
      return jsonError(400, 'invalid_input', 'Invalid redactions payload.')
    }
    console.error('[api/share/redactions] failed', err)
    return jsonError(500, 'internal_error', 'Failed to update redactions.')
  }
}

function isSameOriginRequest(request: Request): boolean {
  const requestUrl = new URL(request.url)
  const origin = request.headers.get('Origin')
  if (origin && origin !== requestUrl.origin) return false
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  return fetchSite !== 'cross-site'
}

function isZodValidationError(err: unknown): boolean {
  return err instanceof Error && err.name === 'ZodError'
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status })
}
