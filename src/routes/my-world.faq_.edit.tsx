import { createFileRoute, useBlocker, useRouter } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { FaqEditorGate } from '~/components/my-world-faq/editor/FaqEditorGate'
import { MyWorldFaqEditorPage } from '~/components/my-world-faq/editor/MyWorldFaqEditorPage'
import { loadMyWorldFaqEditor } from '~/server/my-world-faq-editor.functions'

export const Route = createFileRoute('/my-world/faq_/edit')({
  staleTime: 0,
  preloadStaleTime: 0,
  shouldReload: true,
  loader: loadMyWorldFaqEditRouteData,
  headers: () => ({
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    Vary: 'Cookie',
  }),
  head: () => ({
    meta: [
      { title: 'Edit the My World FAQ' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: MyWorldFaqEditRoute,
  errorComponent: () => <FaqEditorGate unavailable onUnlocked={() => undefined} />,
})

export async function loadMyWorldFaqEditRouteData() {
  try {
    return await loadMyWorldFaqEditor()
  } catch {
    return { status: 'unavailable' as const }
  }
}

function MyWorldFaqEditRoute() {
  const loaderData = Route.useLoaderData()
  const router = useRouter()
  const [dirty, setDirty] = useState(false)
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: false,
    disabled: !dirty,
    withResolver: true,
  })

  const refreshEditor = useCallback(async () => {
    await router.invalidate({
      filter: (match) => match.routeId === Route.id,
      sync: true,
    })
  }, [router])

  if (loaderData.status !== 'ready') {
    return (
      <FaqEditorGate unavailable={loaderData.status === 'unavailable'} onUnlocked={refreshEditor} />
    )
  }

  return (
    <MyWorldFaqEditorPage
      key={loaderData.base.head.revisionId}
      data={loaderData}
      onDirtyStateChanged={setDirty}
      onSessionStateChanged={() => undefined}
      navigationBlock={
        blocker.status === 'blocked'
          ? { proceed: blocker.proceed, reset: blocker.reset }
          : undefined
      }
    />
  )
}
