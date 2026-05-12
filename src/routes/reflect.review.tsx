/**
 * U8 — Post-Mirror review surface. File-based route at `/reflect/review`.
 *
 * Loader uses `context.queryClient.ensureQueryData(['pending-review',
 * STUDENT_ID])` calling `loadPendingReview`. If the loader returns
 * `{diff: null}` the empty state is rendered with a link to /wiki;
 * otherwise `<PostMirrorReview>` renders the staged diff.
 *
 * R30 / AE8 surfacing rule: this route is the destination after every
 * successful `persistMirror` (`MirrorSession`'s `onPersisted`). When
 * `pending_queued: true`, the loader still resolves to the prior
 * pending diff — which is exactly what the student should see first.
 */
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PostMirrorReview } from '~/components/PostMirrorReview'
import { Button } from '~/components/ui/button'
import { loadPendingReview } from '~/server/load-pending-review.functions'

const STUDENT_ID = 'me'

export const Route = createFileRoute('/reflect/review')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['pending-review', STUDENT_ID],
      queryFn: () => loadPendingReview({ data: {} }),
    })
  },
  component: ReviewPage,
})

function ReviewPage() {
  const navigate = useNavigate()
  const { data } = useSuspenseQuery({
    queryKey: ['pending-review', STUDENT_ID],
    queryFn: () => loadPendingReview({ data: {} }),
  })

  if (!data.diff) {
    return (
      <section className="flex flex-col gap-4 py-8" data-testid="review-empty-state">
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          No pending review — head to your library.
        </p>
        <Link to="/library">
          <Button variant="outline" size="sm">
            Go to library
          </Button>
        </Link>
      </section>
    )
  }

  return (
    <PostMirrorReview
      studentId={STUDENT_ID}
      diff={data.diff}
      onDone={() => {
        void navigate({ to: '/library' })
      }}
    />
  )
}
