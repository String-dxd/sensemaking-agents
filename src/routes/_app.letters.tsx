import { createFileRoute } from '@tanstack/react-router'
import { LettersSheet } from '~/components/student-space/sheets/LettersSheet'

// `/letters` — opens the React Letters sheet (U3 of the React migration).
// The engine no longer constructs LettersSheet; this route owns rendering.
export const Route = createFileRoute('/_app/letters')({
  component: LettersPage,
})

function LettersPage() {
  return <LettersSheet />
}
