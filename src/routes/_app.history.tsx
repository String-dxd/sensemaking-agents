import { createFileRoute } from '@tanstack/react-router'
import { HistorySheet } from '~/components/student-space/sheets/HistorySheet'

// `/history` — bare path opens the React History sheet on the default tab
// (`timeline`). U6 React rewrite.
//
// `validateSearch` preserves the legacy `?filter=need-review` query so the
// route-sync hook can forward it into `openSurface`. Without it TanStack
// strips unknown search params on the redirect path.
// `?entry=<id>` opens the mirror reflection detail as a right column inside
// the sheet (Slack-style) instead of navigating to `/mirror/$id`.
export const Route = createFileRoute('/_app/history')({
  validateSearch: (search: Record<string, unknown>): { filter?: 'need-review'; entry?: number } => {
    const out: { filter?: 'need-review'; entry?: number } = {}
    if (search.filter === 'need-review') out.filter = 'need-review'
    const entry = Number(search.entry)
    if (Number.isInteger(entry) && entry > 0) out.entry = entry
    return out
  },
  component: HistoryPage,
})

function HistoryPage() {
  return <HistorySheet />
}
