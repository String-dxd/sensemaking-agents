import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import { type MyWorldFaqContent, prepareMyWorldFaqPublicCopy } from '~/data/my-world-faq'
import { loadMyWorldFaqContent } from '~/server/my-world-faq-content.functions'

export const MY_WORLD_FAQ_PUBLIC_UNAVAILABLE_MESSAGE =
  'The FAQ is temporarily unavailable. Please try again in a moment.'

export const Route = createFileRoute('/my-world/faq')({
  staleTime: 0,
  preloadStaleTime: 0,
  shouldReload: true,
  // The document is the only data needed before first paint. Feedback loads
  // independently at the bottom of the page so a database wake-up cannot hold
  // the whole FAQ response open.
  loader: loadMyWorldFaqPublicRouteData,
  headers: () => ({
    'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
  }),
  head: ({ loaderData }) => myWorldFaqHead(loaderData?.content),
  component: MyWorldFaqRoute,
  errorComponent: MyWorldFaqUnavailable,
})

export async function loadMyWorldFaqPublicRouteData() {
  try {
    const content = await loadMyWorldFaqContent()
    return {
      content: prepareMyWorldFaqPublicCopy(content),
    }
  } catch {
    // The root error component renders messages. Never let a repository,
    // environment or Runtime Cache error cross this public boundary.
    throw new Error(MY_WORLD_FAQ_PUBLIC_UNAVAILABLE_MESSAGE)
  }
}

export function myWorldFaqHead(content: MyWorldFaqContent | undefined) {
  const publishedMetadata = content
    ? [
        { title: content.route.title },
        { name: 'description', content: content.route.description },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: content.route.title },
        { property: 'og:description', content: content.route.description },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: content.route.title },
        { name: 'twitter:description', content: content.route.description },
      ]
    : []

  return {
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'robots', content: 'noindex, nofollow' },
      ...publishedMetadata,
    ],
  }
}

export function createMyWorldFaqPageShowHandler(revalidate: () => void | Promise<void>) {
  return (event: PageTransitionEvent) => {
    if (event.persisted) void revalidate()
  }
}

function MyWorldFaqRoute() {
  const { content } = Route.useLoaderData()
  const router = useRouter()

  useEffect(() => {
    const onPageShow = createMyWorldFaqPageShowHandler(() =>
      router.invalidate({
        filter: (match) => match.routeId === Route.id,
        sync: true,
      }),
    )
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [router])

  return <MyWorldFaqPage feedbackEnabled content={content} authoringShortcutEnabled />
}

function MyWorldFaqUnavailable() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col items-start justify-center gap-4 px-6 py-12">
      <h1 className="text-xl font-semibold tracking-tight">FAQ temporarily unavailable</h1>
      <p className="text-sm leading-relaxed text-[color:rgba(43,38,32,0.7)]">
        {MY_WORLD_FAQ_PUBLIC_UNAVAILABLE_MESSAGE}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 rounded-md border border-current px-4 text-sm font-semibold"
      >
        Try again
      </button>
    </main>
  )
}
