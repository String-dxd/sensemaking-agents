import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ConfirmAndSave } from '~/components/ConfirmAndSave'
import { ConnectorPatternCard } from '~/components/ConnectorPatternCard'
import { PathfinderPathwaysCard } from '~/components/PathfinderPathwaysCard'
import { PathfinderTrajectoryCard } from '~/components/PathfinderTrajectoryCard'
import { Button } from '~/components/ui/button'
import { WikiEntryCard } from '~/components/WikiEntryCard'
import { editMirrorCaution } from '~/server/edit-wiki.functions'
import { loadWiki } from '~/server/load-wiki.functions'
import { triggerSenseMakeNow } from '~/server/trigger-cron.functions'

const STUDENT_ID = 'demo'

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
  const triggerNow = useMutation({
    mutationFn: () => triggerSenseMakeNow({ data: { studentId: STUDENT_ID } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', STUDENT_ID] }),
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>
  if (!data) return <p className="py-8 text-sm">No wiki yet.</p>

  const isDev = import.meta.env.DEV
  const firstEntry = data.entries[0]

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Wiki</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Mirror entries, Connector patterns, Pathfinder trajectory + pathways. Every field is
          editable — click Edit, change, then Confirm.
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

      {firstEntry ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Edit caution on reflection #{firstEntry.id}
          </h2>
          <ConfirmAndSave
            value={firstEntry.caution}
            label={`Caution for reflection #${firstEntry.id}`}
            buildInput={(next) => ({
              data: { studentId: STUDENT_ID, entryId: firstEntry.id, caution: next },
            })}
            mutationFn={editMirrorCaution}
            invalidate={[['wiki', STUDENT_ID]]}
          />
        </div>
      ) : null}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Sense-making
      </h2>
      {data.connector ? (
        <ConnectorPatternCard output={data.connector} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No Connector output yet. Cron runs nightly, or click "Run sense-making now" above.
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
