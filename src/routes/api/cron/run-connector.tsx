import { createFileRoute } from '@tanstack/react-router'
import { runConnectorCronHandler } from '~/server/run-connector.handler.server'

export const Route = createFileRoute('/api/cron/run-connector')({
  server: {
    handlers: {
      GET: ({ request }) => runConnectorCronHandler(request),
      POST: ({ request }) => runConnectorCronHandler(request),
    },
  },
})
