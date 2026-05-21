import { createFileRoute } from '@tanstack/react-router'

// `/history/$tab` — opens History on `timeline` or `growth`. Unknown
// segments fall back to the default tab in `surfaceFromPathname`.
//
// `validateSearch` preserves the legacy `?filter=need-review` query so the
// route-sync hook can forward it into `openSurface`.
export const Route = createFileRoute('/history/$tab')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { filter?: 'need-review' } =>
    search.filter === 'need-review' ? { filter: 'need-review' } : {},
  component: HistoryTabPage,
})

function HistoryTabPage() {
  return null
}
