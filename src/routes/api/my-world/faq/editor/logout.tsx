import { createFileRoute } from '@tanstack/react-router'
import { isSameOriginRequest } from '~/auth/same-origin'

export const Route = createFileRoute('/api/my-world/faq/editor/logout')({
  server: {
    handlers: {
      POST: handleMyWorldFaqEditorLogoutPost,
    },
  },
})

export async function handleMyWorldFaqEditorLogoutPost({
  request,
}: {
  request: Request
}): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { ok: false, error: 'This request must start from the FAQ editor.' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'private, no-store',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
          Vary: 'Cookie',
        },
      },
    )
  }
  const { handleMyWorldFaqEditorLogout } = await import(
    '~/server/my-world-faq-editor.handler.server'
  )
  return handleMyWorldFaqEditorLogout(request)
}
