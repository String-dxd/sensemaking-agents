import { createFileRoute } from '@tanstack/react-router'

// `/history` — bare path opens the History sheet on the default tab
// (`timeline`). The engine owns rendering; this route makes the URL
// bookmarkable.
//
// `validateSearch` preserves the legacy `?filter=need-review` query so the
// route-sync hook can forward it into `openSurface`. Without it TanStack
// strips unknown search params on the redirect path.
export const Route = createFileRoute('/history')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { filter?: 'need-review' } =>
    search.filter === 'need-review' ? { filter: 'need-review' } : {},
  component: HistoryPage,
})

function HistoryPage() {
  return null
}
