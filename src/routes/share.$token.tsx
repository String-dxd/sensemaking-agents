import { createFileRoute } from '@tanstack/react-router'
import { PublicProfilePage } from '~/components/share/PublicProfilePage'
import { NotFoundShareCard, RevokedShareCard } from '~/components/share/RevokedShareCard'
import { shareTokenSchema } from '~/server/function-schemas'
import { loadPublicProfile } from '~/server/load-public-profile.functions'

export const Route = createFileRoute('/share/$token')({
  loader: async ({ params }) => {
    // Malformed token (typo, leftover `$token` placeholder, anything not
    // matching the 22-char base64url shape) is morally a not-found —
    // skip the server round-trip and render the friendly card directly
    // rather than surfacing a raw zod validation error.
    if (!shareTokenSchema.safeParse(params.token).success) {
      return { result: { status: 'not_found' as const } }
    }
    const result = await loadPublicProfile({ data: { token: params.token } })
    return { result }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'A SenseMake profile' },
      {
        name: 'description',
        content: 'A student-shared read of what they value, notice, and are getting good at.',
      },
      // Children's data — never leave a share URL searchable / unfurled with PII.
      // Generic OG card for v1; per-share previews are deferred.
      { name: 'robots', content: 'noindex, nofollow' },
      { property: 'og:title', content: 'A SenseMake profile' },
      {
        property: 'og:description',
        content: 'A student-shared read of what they value, notice, and are getting good at.',
      },
      { property: 'og:image', content: '/share-og-default.png' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: SharePage,
})

function SharePage() {
  const { result } = Route.useLoaderData()
  if (result.status === 'revoked') return <RevokedShareCard />
  if (result.status === 'not_found') return <NotFoundShareCard />
  return <PublicProfilePage profile={result.profile} isOwner={result.isOwner} />
}
