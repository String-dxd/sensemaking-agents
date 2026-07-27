import { createFileRoute } from '@tanstack/react-router'
import { reseedHandler } from '~/server/reseed.handler.server'

// TEMPORARY: token-guarded production reseed. Delete after the one-shot run.
export const Route = createFileRoute('/api/admin/reseed')({
  server: {
    handlers: {
      POST: ({ request }) => reseedHandler(request),
    },
  },
})
