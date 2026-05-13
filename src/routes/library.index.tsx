import { createFileRoute, redirect } from '@tanstack/react-router'
import type { ReflectionsFilter } from '~/components/ReflectionsSheetView'

export const Route = createFileRoute('/library/')({
  validateSearch: (
    search,
  ): {
    filter?: ReflectionsFilter
  } => ({
    filter: search.filter === 'need-review' ? 'need-review' : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/',
      search: {
        sheet: 'reflections',
        filter: search.filter,
      },
    })
  },
  component: () => null,
})
