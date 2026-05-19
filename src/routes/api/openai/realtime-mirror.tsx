import { createFileRoute } from '@tanstack/react-router'
import { openAIRealtimeMirrorSessionHandler } from '~/server/openai-realtime-mirror-session.handler.server'

export const Route = createFileRoute('/api/openai/realtime-mirror')({
  server: {
    handlers: {
      POST: ({ request }) => openAIRealtimeMirrorSessionHandler(request),
    },
  },
})
