import { createFileRoute } from '@tanstack/react-router'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import { DEFAULT_MY_WORLD_FAQ_CONTENT, DEFAULT_MY_WORLD_FAQ_DOCUMENT } from '~/data/my-world-faq'

export const Route = createFileRoute('/my-world/faq')({
  // The feedback delivery path is a later, separately gated implementation
  // unit. Keeping the capability in route data now gives the eventual UI a
  // server-owned, fail-closed seam instead of a client-side assumption.
  loader: async () => ({ feedbackEnabled: false as const }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: DEFAULT_MY_WORLD_FAQ_DOCUMENT.route.title },
      { name: 'description', content: DEFAULT_MY_WORLD_FAQ_DOCUMENT.route.description },
      { name: 'robots', content: 'noindex, nofollow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: DEFAULT_MY_WORLD_FAQ_DOCUMENT.route.title },
      { property: 'og:description', content: DEFAULT_MY_WORLD_FAQ_DOCUMENT.route.description },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: DEFAULT_MY_WORLD_FAQ_DOCUMENT.route.title },
      { name: 'twitter:description', content: DEFAULT_MY_WORLD_FAQ_DOCUMENT.route.description },
    ],
  }),
  component: MyWorldFaqRoute,
})

function MyWorldFaqRoute() {
  const { feedbackEnabled } = Route.useLoaderData()
  return <MyWorldFaqPage feedbackEnabled={feedbackEnabled} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />
}
