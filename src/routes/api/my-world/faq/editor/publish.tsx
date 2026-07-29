import { createFileRoute } from '@tanstack/react-router'
import { isSameOriginRequest } from '~/auth/same-origin'

export const Route = createFileRoute('/api/my-world/faq/editor/publish')({
  server: {
    handlers: {
      POST: handleMyWorldFaqEditorPublishPost,
    },
  },
})

export async function handleMyWorldFaqEditorPublishPost({
  request,
}: {
  request: Request
}): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      {
        ok: false,
        error: 'cross_origin',
        message: 'This request must start from the FAQ editor.',
      },
      {
        status: 403,
        headers: protectedHeaders(),
      },
    )
  }

  const { handleMyWorldFaqEditorPublish } = await import(
    '~/server/my-world-faq-editor.handler.server'
  )
  return handleMyWorldFaqEditorPublish(request)
}

function protectedHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    Vary: 'Cookie',
  })
}
