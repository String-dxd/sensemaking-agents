import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ConnectorPatternCard } from '~/components/ConnectorPatternCard'
import { PathfinderPathwaysCard } from '~/components/PathfinderPathwaysCard'
import { PathfinderTrajectoryCard } from '~/components/PathfinderTrajectoryCard'
import { WikiEntryCard } from '~/components/WikiEntryCard'
import { loadWiki } from '~/server/load-wiki.functions'

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
  const { data, isPending } = useQuery({
    queryKey: ['wiki', STUDENT_ID],
    queryFn: () => loadWiki({ data: { studentId: STUDENT_ID } }),
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>
  if (!data) return <p className="py-8 text-sm">No wiki yet.</p>

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Wiki</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Mirror entries, Connector patterns, Pathfinder trajectory + pathways. Every field is
          editable — click Edit, change, then Confirm. Sense-making runs on demand from the live run
          controls (added in U6).
        </p>
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

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Sense-making
      </h2>
      {data.connector ? (
        <ConnectorPatternCard output={data.connector} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No Connector output yet. The "Run sense-making" live agent visualization lands in U6.
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
