import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ConfirmAndSave } from '~/components/ConfirmAndSave'
import { ConnectorPatternCard } from '~/components/ConnectorPatternCard'
import { PathfinderPathwaysCard } from '~/components/PathfinderPathwaysCard'
import { PathfinderTrajectoryCard } from '~/components/PathfinderTrajectoryCard'
import { Button } from '~/components/ui/button'
import { WikiEntryCard } from '~/components/WikiEntryCard'
import { editMirrorCaution, editMirrorSummary } from '~/server/edit-wiki.functions'
import { loadWikiEntry } from '~/server/load-wiki.functions'

const STUDENT_ID = 'demo'

export const Route = createFileRoute('/wiki/$entryId')({
  loader: async ({ params }) => {
    const id = Number(params.entryId)
    if (!Number.isFinite(id)) throw notFound()
    return { entryId: id }
  },
  component: WikiEntryPage,
})

function WikiEntryPage() {
  const { entryId } = Route.useLoaderData()
  const { data, isPending } = useQuery({
    queryKey: ['wiki', STUDENT_ID, entryId],
    queryFn: () => loadWikiEntry({ data: { studentId: STUDENT_ID, entryId } }),
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>
  if (!data)
    return (
      <div className="flex flex-col gap-3 py-8">
        <p className="text-sm">Entry not found.</p>
        <Link to="/wiki">
          <Button variant="outline" size="sm">
            ← Back to wiki
          </Button>
        </Link>
      </div>
    )

  return (
    <section className="flex flex-col gap-6 py-6">
      <Link to="/wiki" className="text-xs text-muted-foreground hover:text-foreground">
        ← Wiki
      </Link>
      <WikiEntryCard entry={data.entry} />
      <ConfirmAndSave
        value={data.entry.summary}
        label="Summary"
        buildInput={(next) => ({
          data: { studentId: STUDENT_ID, entryId: data.entry.id, summary: next },
        })}
        mutationFn={editMirrorSummary}
        invalidate={[
          ['wiki', STUDENT_ID, entryId],
          ['wiki', STUDENT_ID],
        ]}
      />
      <ConfirmAndSave
        value={data.entry.caution}
        label="Caution"
        buildInput={(next) => ({
          data: { studentId: STUDENT_ID, entryId: data.entry.id, caution: next },
        })}
        mutationFn={editMirrorCaution}
        invalidate={[
          ['wiki', STUDENT_ID, entryId],
          ['wiki', STUDENT_ID],
        ]}
      />
      {data.connector ? <ConnectorPatternCard output={data.connector} /> : null}
      {data.pathfinder ? (
        <>
          <PathfinderTrajectoryCard output={data.pathfinder} />
          <PathfinderPathwaysCard output={data.pathfinder} />
        </>
      ) : null}
    </section>
  )
}
