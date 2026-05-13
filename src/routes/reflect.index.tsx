import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/reflect/')({
  loader: () => {
    throw redirect({ to: '/' })
  },
  component: () => null,
})
