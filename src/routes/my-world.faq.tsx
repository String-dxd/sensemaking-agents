import { createFileRoute } from '@tanstack/react-router'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'

const FAQ_TITLE = 'My World: Signals → Sensemaking'
const FAQ_DESCRIPTION =
  'A working prototype FAQ about My World’s reflection hypothesis, open questions, and proposed pilot guardrails.'

export const Route = createFileRoute('/my-world/faq')({
  // The feedback delivery path is a later, separately gated implementation
  // unit. Keeping the capability in route data now gives the eventual UI a
  // server-owned, fail-closed seam instead of a client-side assumption.
  loader: async () => ({ feedbackEnabled: false as const }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: FAQ_TITLE },
      { name: 'description', content: FAQ_DESCRIPTION },
      { name: 'robots', content: 'noindex, nofollow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: FAQ_TITLE },
      { property: 'og:description', content: FAQ_DESCRIPTION },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: FAQ_TITLE },
      { name: 'twitter:description', content: FAQ_DESCRIPTION },
    ],
  }),
  component: MyWorldFaqRoute,
})

function MyWorldFaqRoute() {
  const { feedbackEnabled } = Route.useLoaderData()
  return <MyWorldFaqPage feedbackEnabled={feedbackEnabled} />
}
