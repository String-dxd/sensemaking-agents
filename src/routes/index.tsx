import { createFileRoute } from '@tanstack/react-router'
import { StudentSpaceHost } from '~/components/StudentSpaceHost'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return <StudentSpaceHost />
}
