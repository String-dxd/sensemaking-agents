import { createFileRoute } from '@tanstack/react-router'
import { MirrorDetailSheet } from '~/components/student-space/sheets/MirrorDetailSheet'

// `/mirror/$id` — full details page for a single mirror reflection, opened
// from the History day-detail card's "Show more" link.
//
// Lives at `/mirror/$id` (not `/history/mirror/$id`) because TanStack's
// matcher picks `/history/$tab` (with $tab='mirror') over the more specific
// `/history/mirror/$id` when both are siblings under `_app/history` —
// hoisting one level avoids the conflict.
export const Route = createFileRoute('/_app/mirror/$id')({
  component: MirrorDetailPage,
})

function MirrorDetailPage() {
  return <MirrorDetailSheet />
}
