import { createFileRoute } from '@tanstack/react-router'

import { UnauthenticatedError } from '~/auth/identity'
import { getIslandStateAtHandler } from '~/server/island-state-at.handler.server'

export const Route = createFileRoute('/api/growth/island-state-at')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
    },
  },
})

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const year = parseYearParam(url)
  if (year === null) {
    return jsonError(400, 'invalid_year', 'year query param must be an integer.')
  }
  try {
    const result = await getIslandStateAtHandler({ year })
    return Response.json(result)
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return jsonError(401, 'unauthenticated', err.message)
    }
    if (isZodValidationError(err)) {
      return jsonError(400, 'invalid_year', 'year query param is outside the supported range.')
    }
    console.error('[api/growth/island-state-at] failed', err)
    return jsonError(500, 'internal_error', 'Failed to load historical island state.')
  }
}

function parseYearParam(url: URL): number | null {
  const yearRaw = url.searchParams.get('year')
  if (!yearRaw || !/^\d+$/.test(yearRaw)) return null
  return Number.parseInt(yearRaw, 10)
}

function isZodValidationError(err: unknown): boolean {
  return err instanceof Error && err.name === 'ZodError'
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status })
}
