import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ConfirmAndSave } from '~/components/ConfirmAndSave'
import { ConnectorPatternCard } from '~/components/ConnectorPatternCard'
import { PathfinderPathwaysCard } from '~/components/PathfinderPathwaysCard'
import { PathfinderTrajectoryCard } from '~/components/PathfinderTrajectoryCard'
import { Button } from '~/components/ui/button'
import { WikiEntryCard } from '~/components/WikiEntryCard'
import type { MirrorEditableField } from '~/db/queries'
import { editMirrorField } from '~/server/edit-wiki.functions'
import { loadWikiEntry } from '~/server/load-wiki.functions'

const STUDENT_ID = 'demo'

export const Route = createFileRoute('/library/$entryId')({
  loader: async ({ params }) => {
    const id = Number(params.entryId)
    if (!Number.isFinite(id)) throw notFound()
    return { entryId: id }
  },
  component: WikiEntryPage,
})

const FIELD_LABELS: Record<MirrorEditableField, string> = {
  validation: 'Validation',
  inferred_meaning: 'Inferred meaning',
  story_reframe: 'Story reframe',
}

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
        <Link to="/library">
          <Button variant="outline" size="sm">
            ← Back to library
          </Button>
        </Link>
      </div>
    )

  const fields: MirrorEditableField[] = ['story_reframe', 'validation', 'inferred_meaning']

  return (
    <section className="flex flex-col gap-6 py-6">
      <Link to="/library" className="text-xs text-muted-foreground hover:text-foreground">
        ← Wiki
      </Link>
      <WikiEntryCard entry={data.entry} />
      {fields.map((field) => (
        <ConfirmAndSave
          key={field}
          value={data.entry[field]}
          label={FIELD_LABELS[field]}
          buildInput={(next) => ({
            data: { studentId: STUDENT_ID, entryId: data.entry.id, field, value: next },
          })}
          mutationFn={editMirrorField}
          invalidate={[
            ['wiki', STUDENT_ID, entryId],
            ['wiki', STUDENT_ID],
          ]}
        />
      ))}
      <details className="rounded border border-border/40 bg-muted/20 p-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Transcript</summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{data.entry.transcript}</p>
      </details>
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
