import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/reflect/review')({
  loader: () => {
    throw redirect({ to: '/library', search: { filter: 'need-review' } })
  },
  component: () => null,
})
