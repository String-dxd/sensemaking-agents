import { createFileRoute } from '@tanstack/react-router'
import { isSameOriginRequest } from '~/auth/same-origin'

export const Route = createFileRoute('/api/my-world/faq/editor/restore')({
  server: {
    handlers: {
      POST: handleMyWorldFaqEditorRestorePost,
    },
  },
})

export async function handleMyWorldFaqEditorRestorePost({
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

  const { handleMyWorldFaqEditorRestore } = await import(
    '~/server/my-world-faq-history.handler.server'
  )
  return handleMyWorldFaqEditorRestore(request)
}

function protectedHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    Vary: 'Cookie',
  })
}
