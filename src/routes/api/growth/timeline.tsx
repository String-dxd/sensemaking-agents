import { createFileRoute } from '@tanstack/react-router'

import { UnauthenticatedError } from '~/auth/identity'
import { getGrowthTimelineHandler } from '~/server/growth-timeline.handler.server'

export const Route = createFileRoute('/api/growth/timeline')({
  server: {
    handlers: {
      GET: () => handle(),
    },
  },
})

async function handle(): Promise<Response> {
  try {
    const result = await getGrowthTimelineHandler()
    return Response.json(result)
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return Response.json(
        { ok: false, error: { code: 'unauthenticated', message: err.message } },
        { status: 401 },
      )
    }
    console.error('[api/growth/timeline] failed', err)
    return Response.json(
      { ok: false, error: { code: 'internal_error', message: 'Failed to load timeline.' } },
      { status: 500 },
    )
  }
}
