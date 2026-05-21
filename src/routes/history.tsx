import { createFileRoute } from '@tanstack/react-router'

// `/history` — bare path opens the History sheet on the default tab
// (`timeline`). The engine owns rendering; this route makes the URL
// bookmarkable.
export const Route = createFileRoute('/history')({
  component: HistoryPage,
})

function HistoryPage() {
  return null
}
