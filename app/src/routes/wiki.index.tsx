import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ConfirmAndSave } from '~/components/ConfirmAndSave'
import { ConnectorPatternCard } from '~/components/ConnectorPatternCard'
import { PathfinderPathwaysCard } from '~/components/PathfinderPathwaysCard'
import { PathfinderTrajectoryCard } from '~/components/PathfinderTrajectoryCard'
import { Button } from '~/components/ui/button'
import { WikiEntryCard } from '~/components/WikiEntryCard'
import { loadMockWiki, mockEditCaution } from '~/lib/wiki-mocks'
import { triggerSenseMakeNow } from '~/server/trigger-cron.functions'

export const Route = createFileRoute('/wiki/')({
  component: WikiIndexPage,
})

function WikiIndexPage() {
  const { data, isPending } = useQuery({
    queryKey: ['wiki', 'demo', 'mock'],
    queryFn: loadMockWiki,
  })
  const triggerNow = useMutation({
    mutationFn: () => triggerSenseMakeNow({ data: { studentId: 'demo' } }),
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>
  if (!data) return <p className="py-8 text-sm">No wiki yet.</p>

  const firstEntry = data.entries[0]
  const isDev = import.meta.env.DEV

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Wiki</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Mirror entries, Connector patterns, Pathfinder trajectory + pathways. Mock data in U3 — U9
          wires real persistence.
        </p>
        {isDev ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerNow.mutate()}
              disabled={triggerNow.isPending}
              data-testid="trigger-sense-make-now"
            >
              {triggerNow.isPending ? 'queueing…' : 'Run sense-making now'}
            </Button>
            {triggerNow.isSuccess ? (
              <span className="text-xs text-muted-foreground">
                queued: run {triggerNow.data?.runId}
              </span>
            ) : null}
            {triggerNow.isError ? (
              <span className="text-xs text-warning">{triggerNow.error.message}</span>
            ) : null}
          </div>
        ) : null}
      </header>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Reflections
      </h2>
      <div className="flex flex-col gap-4">
        {data.entries.map((entry) => (
          <WikiEntryCard key={entry.id} entry={entry} />
        ))}
      </div>

      {firstEntry ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Edit caution (mock round-trip)
          </h2>
          <ConfirmAndSave
            value={firstEntry.caution}
            label={`Caution for reflection #${firstEntry.id}`}
            buildInput={(next) => ({ entryId: firstEntry.id, caution: next })}
            mutationFn={mockEditCaution}
            invalidate={[['wiki', 'demo', 'mock']]}
          />
        </div>
      ) : null}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Sense-making
      </h2>
      <ConnectorPatternCard output={data.connector} />
      <PathfinderTrajectoryCard output={data.pathfinder} />
      <PathfinderPathwaysCard output={data.pathfinder} />
    </section>
  )
}
