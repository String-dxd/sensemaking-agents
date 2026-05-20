import { createFileRoute } from '@tanstack/react-router'

import { UnauthenticatedError } from '~/auth/identity'
import { getYearEntriesHandler } from '~/server/year-entries.handler.server'

export const Route = createFileRoute('/api/growth/year-entries')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
    },
  },
})

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const yearRaw = url.searchParams.get('year')
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : Number.NaN
  if (!Number.isFinite(year)) {
    return jsonError(400, 'invalid_year', 'year query param must be an integer.')
  }
  try {
    const result = await getYearEntriesHandler({ year })
    return Response.json(result)
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return jsonError(401, 'unauthenticated', err.message)
    }
    console.error('[api/growth/year-entries] failed', err)
    return jsonError(500, 'internal_error', 'Failed to load year entries.')
  }
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status })
}
