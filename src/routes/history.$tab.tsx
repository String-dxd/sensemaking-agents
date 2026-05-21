import { createFileRoute } from '@tanstack/react-router'

// `/history/$tab` — opens History on `timeline` or `growth`. Unknown
// segments fall back to the default tab in `surfaceFromPathname`.
export const Route = createFileRoute('/history/$tab')({
  component: HistoryTabPage,
})

function HistoryTabPage() {
  return null
}
