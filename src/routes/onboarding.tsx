import { createFileRoute } from '@tanstack/react-router'
import { StudentSpaceHost } from '~/components/StudentSpaceHost'

// `/onboarding` gives the first-run ceremony its own route while still
// mounting the world interaction bridge that owns Kira's speech bubble.
export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  return <StudentSpaceHost />
}
