/**
 * U9 — `/library/$dimension` per-VIPS-dimension page. The student arrives here
 * by clicking one of the four overview cards (or a trait-chip in
 * TrajectoryPageView). The full compiled-truth paragraph + open-question
 * line + chronological timeline render here.
 *
 * Loader rules:
 *   - `$dimension` must be one of the four canonical VIPS dimensions; any
 *     other value 404s (TanStack's `notFound()` boundary).
 *   - R30 / AE8: if any `vips_proposed_diffs.status='pending'` row exists
 *     for the student, defer to `/reflect/review`. The student must clear
 *     the queue before the library is reachable. Mirrors the library overview
 *     and `/wiki/trajectory` (U11) rules.
 */
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, redirect } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'
import { VipsPageView } from '~/components/VipsPageView'
import type { VipsDimension } from '~/data/vips-taxonomy'
import { loadPendingReview } from '~/server/load-pending-review.functions'
import { loadVipsPages } from '~/server/load-vips-pages.functions'

const STUDENT_ID = 'demo'

const VALID_DIMENSIONS: readonly VipsDimension[] = [
  'values',
  'interests',
  'personality',
  'skills',
] as const

function isVipsDimension(s: string): s is VipsDimension {
  return (VALID_DIMENSIONS as readonly string[]).includes(s)
}

export const Route = createFileRoute('/library/$dimension')({
  loader: async ({ params, context }) => {
    if (!isVipsDimension(params.dimension)) throw notFound()
    const dimension: VipsDimension = params.dimension

    // R30: pending diffs first. We hit the dedicated pending-review fn
    // (not loadVipsPages) so the redirect decision is one tiny query and
    // doesn't depend on the library query shape.
    const pending = await context.queryClient.ensureQueryData({
      queryKey: ['pending-review', STUDENT_ID],
      queryFn: () => loadPendingReview({ data: { studentId: STUDENT_ID } }),
    })
    if (pending.diff) {
      throw redirect({ to: '/reflect/review' })
    }

    await context.queryClient.ensureQueryData({
      queryKey: ['vips-pages', STUDENT_ID],
      queryFn: () => loadVipsPages({ data: { studentId: STUDENT_ID } }),
    })

    return { dimension }
  },
  component: WikiDimensionPage,
})

function WikiDimensionPage() {
  const { dimension } = Route.useLoaderData()
  const { data, isPending } = useQuery({
    queryKey: ['vips-pages', STUDENT_ID],
    queryFn: () => loadVipsPages({ data: { studentId: STUDENT_ID } }),
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>
  if (!data) return <p className="py-8 text-sm">No library yet.</p>

  const page = data.pages.find((p) => p.dimension === dimension)
  const timeline = data.timeline_by_dimension[dimension] ?? []

  if (!page) {
    // Should not happen — the loader synthesizes a stub row for missing
    // dimensions — but if it does, fail soft to a back-link.
    return (
      <section className="flex flex-col gap-4 py-8">
        <Link to="/library" className="text-xs text-muted-foreground hover:text-foreground">
          ← Wiki
        </Link>
        <p className="text-sm">No page for this dimension yet.</p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4 py-2">
      <Link to="/library" className="text-xs text-muted-foreground hover:text-foreground">
        ← Wiki
      </Link>
      <VipsPageView studentId={STUDENT_ID} dimension={dimension} page={page} timeline={timeline} />
      <div>
        <Link to="/library">
          <Button variant="outline" size="sm">
            Back to library
          </Button>
        </Link>
      </div>
    </section>
  )
}
