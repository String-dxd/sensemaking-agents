import { createFileRoute } from '@tanstack/react-router'
import { isSameOriginRequest } from '~/auth/same-origin'

export const Route = createFileRoute('/api/my-world/faq/editor/session')({
  server: {
    handlers: {
      POST: handleMyWorldFaqEditorSessionPost,
    },
  },
})

export async function handleMyWorldFaqEditorSessionPost({
  request,
}: {
  request: Request
}): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return privateRouteJson(403, 'This request must start from the FAQ editor.')
  }
  const { handleMyWorldFaqEditorUnlock } = await import(
    '~/server/my-world-faq-editor.handler.server'
  )
  return handleMyWorldFaqEditorUnlock(request)
}

function privateRouteJson(status: number, error: string): Response {
  return Response.json(
    { ok: false, error },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
      },
    },
  )
}
