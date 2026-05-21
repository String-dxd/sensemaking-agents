import { createFileRoute } from '@tanstack/react-router'

// `/letters` — opens the Letters sheet. Engine owns rendering.
export const Route = createFileRoute('/letters')({
  component: LettersPage,
})

function LettersPage() {
  return null
}
