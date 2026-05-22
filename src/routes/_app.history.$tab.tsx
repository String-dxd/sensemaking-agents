import { createFileRoute } from '@tanstack/react-router'
import { HistorySheet } from '~/components/student-space/sheets/HistorySheet'

// `/history/$tab` — opens the React History sheet on `timeline` or `growth`.
// Unknown segments fall back to the default tab in `surfaceFromPathname`.
// U6 React rewrite.
export const Route = createFileRoute('/_app/history/$tab')({
  validateSearch: (search: Record<string, unknown>): { filter?: 'need-review' } =>
    search.filter === 'need-review' ? { filter: 'need-review' } : {},
  component: HistoryTabPage,
})

function HistoryTabPage() {
  return <HistorySheet />
}
