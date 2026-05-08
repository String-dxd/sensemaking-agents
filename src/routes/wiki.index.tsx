import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { RunStepEvent } from '~/agents/run-events'
import { AgentRunVisualizer } from '~/components/AgentRunVisualizer'
import { ConnectorPatternCard } from '~/components/ConnectorPatternCard'
import { PathfinderPathwaysCard } from '~/components/PathfinderPathwaysCard'
import { PathfinderTrajectoryCard } from '~/components/PathfinderTrajectoryCard'
import { Button } from '~/components/ui/button'
import { WikiEntryCard } from '~/components/WikiEntryCard'
import { loadWiki } from '~/server/load-wiki.functions'
import { runSensemaking } from '~/server/run-sensemaking.functions'

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
  const { data, isPending } = useQuery({
    queryKey: ['wiki', STUDENT_ID],
    queryFn: () => loadWiki({ data: { studentId: STUDENT_ID } }),
  })

  const sensemake = useMutation({
    mutationFn: () => runSensemaking({ data: { studentId: STUDENT_ID } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', STUDENT_ID] }),
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
                : 'Run Connector + Pathfinder over your reflections'
            }
          >
            {sensemake.isPending
              ? 'thinking through your reflections…'
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
              Connector is reading your wiki and looking for patterns…
            </p>
          ) : null}
          {sensemake.isSuccess ? (
            <AgentRunVisualizer events={events} />
          ) : (
            <AgentRunVisualizer
              events={[
                {
                  type: 'agent_started',
                  agent: 'connector',
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

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Sense-making
      </h2>
      {data.connector ? (
        <ConnectorPatternCard output={data.connector} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No Connector output yet. Press “Run sense-making” when you have a few reflections in.
        </p>
      )}
      {data.pathfinder ? (
        <>
          <PathfinderTrajectoryCard output={data.pathfinder} />
          <PathfinderPathwaysCard output={data.pathfinder} />
        </>
      ) : null}
    </section>
  )
}
