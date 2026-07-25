import { createFileRoute } from '@tanstack/react-router'
import { isSameOriginRequest } from '~/auth/same-origin'
import { openAIRealtimeMirrorSessionHandler } from '~/server/openai-realtime-mirror-session.handler.server'

export const Route = createFileRoute('/api/openai/realtime-mirror')({
  server: {
    handlers: {
      POST: ({ request }) => {
        if (!isSameOriginRequest(request)) {
          return new Response('Realtime session must start from this site.', { status: 403 })
        }
        return openAIRealtimeMirrorSessionHandler(request)
      },
    },
  },
})
