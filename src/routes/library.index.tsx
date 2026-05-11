/**
 * U9 — `/wiki` overview. Four cards (one per VIPS dimension) + a single
 * "Run sense-making" button. The v0.1 mirror-entry list and the
 * `SENSEMAKE_GATE = 3` hard gate are gone — the gate is now a confirm
 * dialog driven by `total_claim_count` from `loadVipsPages` (R24 / AE5).
 *
 * Run-sense-making invocation: the button mutates via `runCartographer`
 * inline (same pattern as U11's scaffolding) so the AgentRunVisualizer
 * surfaces a live agent chain on this page during the run. On a
 * successful run we navigate to `/wiki/trajectory`. We deliberately do
 * NOT hand the trajectory route the responsibility of triggering
 * runCartographer — its loader is a read-only fetch of the most-recent
 * `cartographer_outputs` row (U11) and adding a side-effect to it would
 * double-fire on tab-revisit. Keeping the mutation here also lets the
 * weak-corpus confirm dialog gate cleanly: only on confirm (or count >=
 * 3) do we kick the agent run.
 *
 * R30 enforcement: the loader hits `loadPendingReview` first. Any pending
 * diff bounces to `/reflect/review` before the cards render. Same rule
 * as `/library/$dimension` (U9) and `/wiki/trajectory` (U11) — F1's review
 * queue blocks every wiki surface.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { RunStepEvent } from '~/agents/run-events'
import { AgentRunVisualizer } from '~/components/AgentRunVisualizer'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import type { VipsDimension } from '~/data/vips-taxonomy'
import { counsellorBrief } from '~/server/counsellor-brief.functions'
import { loadPendingReview } from '~/server/load-pending-review.functions'
import { loadVipsPages } from '~/server/load-vips-pages.functions'
import { runCartographer } from '~/server/run-cartographer.functions'

const STUDENT_ID = 'demo'
const WEAK_CORPUS_THRESHOLD = 3

const DIMENSION_LABEL: Record<VipsDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

const DIMENSION_TAGLINE: Record<VipsDimension, string> = {
  values: 'What you orient toward.',
  interests: 'Where your attention pulls.',
  personality: 'How you tend to show up.',
  skills: 'What you practice and build.',
}

export const Route = createFileRoute('/library/')({
  loader: async ({ context }) => {
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
  },
  component: LibraryIndexPage,
})

function LibraryIndexPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [weakCorpusOpen, setWeakCorpusOpen] = useState(false)

  const { data, isPending } = useQuery({
    queryKey: ['vips-pages', STUDENT_ID],
    queryFn: () => loadVipsPages({ data: { studentId: STUDENT_ID } }),
  })

  const sensemake = useMutation({
    mutationFn: () => runCartographer({ data: { studentId: STUDENT_ID } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['vips-pages', STUDENT_ID] })
      qc.invalidateQueries({ queryKey: ['trajectory', STUDENT_ID] })
      // Navigate only on a successful Cartographer run (ok=true). On
      // schema_reject / no_valid_pathways / agent_error we stay here so
      // the visualizer's error row is visible and the student can press
      // again. Mirrors U11's scaffolding behavior.
      if (result.ok) {
        navigate({ to: '/library/trajectory' })
      }
    },
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>
  if (!data) return <p className="py-8 text-sm">No library yet.</p>

  const events: RunStepEvent[] = sensemake.data?.events ?? []
  const showVisualizer = sensemake.isPending || sensemake.isSuccess

  // R24 / AE5: no hard gate. The dialog fires only when the corpus is
  // weak; otherwise we mutate immediately.
  const onRunClicked = () => {
    if (sensemake.isPending) return
    if (data.total_claim_count < WEAK_CORPUS_THRESHOLD) {
      setWeakCorpusOpen(true)
      return
    }
    sensemake.mutate()
  }

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          The patterns we've heard across your reflections, grouped by Values, Interests,
          Personality, and Skills. Pages refine themselves as you reflect.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="vips-overview-grid">
        {data.pages.map((page) => {
          const dim = page.dimension as VipsDimension
          const claimCount = data.claim_count_by_dimension[dim] ?? 0
          return (
            <Link
              key={dim}
              to="/library/$dimension"
              params={{ dimension: dim }}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
              data-testid={`vips-card-${dim}`}
            >
              <Card className="h-full transition-colors hover:bg-muted/30">
                <CardHeader>
                  <CardTitle>{DIMENSION_LABEL[dim]}</CardTitle>
                  <CardDescription>{DIMENSION_TAGLINE[dim]}</CardDescription>
                </CardHeader>
                <CardContent className="gap-2">
                  {page.compiled_truth.trim().length > 0 ? (
                    <p
                      className="line-clamp-2 text-sm leading-relaxed"
                      data-testid={`vips-card-${dim}-compiled-truth`}
                    >
                      {page.compiled_truth}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No pattern yet — reflect a few times to fill this in.
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span data-testid={`vips-card-${dim}-claim-count`}>
                      {claimCount} {claimCount === 1 ? 'claim' : 'claims'}
                    </span>
                    {page.updated_at ? (
                      <span data-testid={`vips-card-${dim}-updated-at`}>
                        updated {new Date(page.updated_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="italic">never updated</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={onRunClicked}
          disabled={sensemake.isPending}
          data-testid="run-sensemaking"
          title="Run Cartographer over your VIPS pages and generate a Trajectory page"
        >
          {sensemake.isPending
            ? 'mapping your trajectory…'
            : sensemake.isSuccess
              ? 'Run sense-making again'
              : 'Run sense-making'}
        </Button>
        <span className="text-xs text-muted-foreground" data-testid="claim-count-tooltip">
          {data.total_claim_count} verified {data.total_claim_count === 1 ? 'claim' : 'claims'}{' '}
          across all dimensions
        </span>
        {sensemake.isError ? (
          <span className="text-xs text-warning" role="alert">
            {sensemake.error instanceof Error ? sensemake.error.message : 'sense-making failed'}
          </span>
        ) : null}
        <ExportCounsellorBriefLink studentId={STUDENT_ID} />
      </div>

      {showVisualizer ? (
        <section data-testid="live-run-section" className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Live agent chain
          </h2>
          {sensemake.isPending ? (
            <p className="text-xs text-muted-foreground">
              Cartographer is reading your VIPS pages and sketching pathways…
            </p>
          ) : null}
          {sensemake.isSuccess ? (
            <AgentRunVisualizer events={events} />
          ) : (
            <AgentRunVisualizer
              events={[
                {
                  type: 'agent_started',
                  agent: 'cartographer',
                  timestampMs: 0,
                },
              ]}
            />
          )}
        </section>
      ) : null}

      <ConfirmDialog
        open={weakCorpusOpen}
        title="Patterns may be weak"
        description="You have fewer than 3 verified claims across your VIPS pages. The Trajectory page may read tentative or generic. Run anyway?"
        confirmLabel="Run anyway"
        cancelLabel="Cancel"
        onConfirm={() => {
          setWeakCorpusOpen(false)
          sensemake.mutate()
        }}
        onCancel={() => setWeakCorpusOpen(false)}
      />
    </section>
  )
}

/**
 * U12 — "Export counsellor brief" link. Calls the `counsellorBrief` server
 * fn, wraps the returned markdown in a `Blob`, and triggers an anchor-based
 * download. Per R22 the brief is on-demand and not auto-persisted; the
 * server fn never writes to disk, and the URL.createObjectURL handle is
 * revoked immediately after the click so the blob is not retained.
 *
 * Filename: `counsellor-brief-{studentId}-{YYYY-MM-DD}.md` — same date as
 * the markdown header for traceability between filename and rendered title.
 */
function ExportCounsellorBriefLink({ studentId }: { studentId: string }) {
  const exportBrief = useMutation({
    mutationFn: () => counsellorBrief({ data: { studentId } }),
    onSuccess: (result) => {
      const today = new Date().toISOString().slice(0, 10)
      const blob = new Blob([result.markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `counsellor-brief-${studentId}-${today}.md`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      // Revoke synchronously — the browser has already started the download
      // by the time the click handler returns.
      URL.revokeObjectURL(url)
    },
  })

  return (
    <button
      type="button"
      onClick={() => {
        if (exportBrief.isPending) return
        exportBrief.mutate()
      }}
      disabled={exportBrief.isPending}
      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      data-testid="export-counsellor-brief"
      title="Download a markdown brief of the library + trajectory for offline review"
    >
      {exportBrief.isPending
        ? 'downloading…'
        : exportBrief.isError
          ? 'export failed — retry'
          : 'Export counsellor brief'}
    </button>
  )
}
