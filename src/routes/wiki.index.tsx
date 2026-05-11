import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { RunStepEvent } from '~/agents/run-events'
import { AgentRunVisualizer } from '~/components/AgentRunVisualizer'
import { Button } from '~/components/ui/button'
import { WikiEntryCard } from '~/components/WikiEntryCard'
import { loadWiki } from '~/server/load-wiki.functions'
import { runCartographer } from '~/server/run-cartographer.functions'

// U9 will replace this overview with the 4-card VIPS pages layout. For U11
// we only add minimal scaffolding so the F2 flow (Run sense-making → live
// visualizer → /wiki/trajectory) works end-to-end; the legacy
// Connector/Pathfinder cards have been removed because U11 reshapes those
// outputs.
const STUDENT_ID = 'demo'
const SENSEMAKE_GATE = 3

export const Route = createFileRoute('/wiki/')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['wiki', STUDENT_ID],
      queryFn: () => loadWiki({ data: { studentId: STUDENT_ID } }),
    })
  },
  component: WikiIndexPage,
})

function WikiIndexPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, isPending } = useQuery({
    queryKey: ['wiki', STUDENT_ID],
    queryFn: () => loadWiki({ data: { studentId: STUDENT_ID } }),
  })

  const sensemake = useMutation({
    mutationFn: () => runCartographer({ data: { studentId: STUDENT_ID } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['wiki', STUDENT_ID] })
      qc.invalidateQueries({ queryKey: ['trajectory', STUDENT_ID] })
      // Navigate only on a successful Cartographer run (ok=true). On
      // schema_reject / no_valid_pathways / agent_error we stay on /wiki
      // so the visualizer's error row remains visible; the student can
      // press Run sense-making again. U9 may upgrade this to surface the
      // explicit error in a banner.
      if (result.ok) {
        navigate({ to: '/wiki/trajectory' })
      }
    },
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>
  if (!data) return <p className="py-8 text-sm">No wiki yet.</p>

  const corpusSize = data.entries.length
  const gated = corpusSize < SENSEMAKE_GATE
  const events: RunStepEvent[] = sensemake.data?.events ?? []
  const showVisualizer = sensemake.isPending || sensemake.isSuccess

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Wiki</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Mirror entries and the patterns that emerge across them. Every reflection field is
          editable — click Edit, change, then Confirm. Sense-making is on demand.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => sensemake.mutate()}
            disabled={gated || sensemake.isPending}
            data-testid="run-sensemaking"
            title={
              gated
                ? `Add at least ${SENSEMAKE_GATE} reflections to enable sense-making`
                : 'Run Cartographer over your VIPS pages and generate a Trajectory page'
            }
          >
            {sensemake.isPending
              ? 'mapping your trajectory…'
              : sensemake.isSuccess
                ? 'Run sense-making again'
                : 'Run sense-making'}
          </Button>
          {gated ? (
            <span className="text-xs text-muted-foreground" data-testid="gate-tooltip">
              {`add ${SENSEMAKE_GATE - corpusSize} more reflection${
                SENSEMAKE_GATE - corpusSize === 1 ? '' : 's'
              } to enable`}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {corpusSize} reflection{corpusSize === 1 ? '' : 's'} in the corpus
            </span>
          )}
          {sensemake.isError ? (
            <span className="text-xs text-warning" role="alert">
              {sensemake.error instanceof Error ? sensemake.error.message : 'sense-making failed'}
            </span>
          ) : null}
        </div>
      </header>

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

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Reflections
      </h2>
      {data.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No reflections yet. Open <code>/reflect</code> to start one.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.entries.map((entry) => (
            <WikiEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}
