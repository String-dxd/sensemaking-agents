import { createFileRoute } from '@tanstack/react-router'

// `/profile` — bare path opens the Profile sheet on the default tab
// (`values`). The visible UI is owned by the engine mounted in
// `__root.tsx`; this route exists so the URL is bookmarkable and the
// route-sync hook can derive the surface from the pathname.
export const Route = createFileRoute('/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  return null
}
