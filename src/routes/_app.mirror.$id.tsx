import { createFileRoute, redirect } from '@tanstack/react-router'

// `/mirror/$id` — legacy deep link to a single mirror reflection. The detail
// view now lives inside the History sheet as a right column
// (`/history?entry=<id>`), so this route just forwards old links there.
export const Route = createFileRoute('/_app/mirror/$id')({
  beforeLoad: ({ params }) => {
    const entry = Number(params.id)
    throw redirect({
      to: '/history',
      search: Number.isInteger(entry) && entry > 0 ? { entry } : {},
    })
  },
})
