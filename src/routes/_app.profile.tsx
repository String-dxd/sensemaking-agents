import { createFileRoute } from '@tanstack/react-router'
import { ProfileSheet } from '~/components/student-space/sheets/ProfileSheet'

// `/profile` — bare path opens the React Profile sheet on the default tab
// (`values`). U7 React rewrite.
export const Route = createFileRoute('/_app/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  return <ProfileSheet />
}
