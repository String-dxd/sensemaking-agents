import { createFileRoute } from '@tanstack/react-router'
import { ProfileSheet } from '~/components/student-space/sheets/ProfileSheet'

// `/profile/$tab` — opens the React Profile sheet on the named tab. Unknown
// segments fall back to `values` inside the React component.
export const Route = createFileRoute('/_app/profile/$tab')({
  component: ProfileTabPage,
})

function ProfileTabPage() {
  return <ProfileSheet />
}
