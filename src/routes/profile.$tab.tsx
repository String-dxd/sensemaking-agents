import { createFileRoute } from '@tanstack/react-router'

// `/profile/$tab` — opens the Profile sheet on the named tab. The tab is
// validated by `surfaceFromPathname` in `route-sync.ts`; unknown segments
// fall back to the default tab on the engine side. We don't redirect here
// (an unknown tab still renders Profile rather than 404-ing) to keep
// shared/bookmarked links forgiving.
export const Route = createFileRoute('/profile/$tab')({
  component: ProfileTabPage,
})

function ProfileTabPage() {
  return null
}
