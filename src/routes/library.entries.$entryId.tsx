import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ConfirmAndSave } from '~/components/ConfirmAndSave'
import { ConnectedVipsLinks } from '~/components/ConnectedVipsLinks'
import { MirrorEvalReviewPanel, parseMirrorEvalReview } from '~/components/MirrorEvalReview'
import { Button } from '~/components/ui/button'
import { WikiEntryCard } from '~/components/WikiEntryCard'
import type { MirrorEditableField } from '~/db/queries'
import { editMirrorField } from '~/server/edit-wiki.functions'
import { loadWikiEntry } from '~/server/load-wiki.functions'

const STUDENT_ID = 'me'

export const Route = createFileRoute('/library/entries/$entryId')({
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
    queryFn: () => loadWikiEntry({ data: { entryId } }),
  })

  if (isPending) return <p className="py-8 text-sm text-muted-foreground">loading…</p>
  if (!data)
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 py-8">
        <p className="text-sm">Entry not found.</p>
        <Link to="/" className="w-fit">
          <Button variant="outline" size="sm">
            ← Back to island
          </Button>
        </Link>
      </div>
    )

  const fields: MirrorEditableField[] = ['story_reframe', 'validation', 'inferred_meaning']
  const evalReview = parseMirrorEvalReview(data.entry.raw_output_json)

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-6">
      <PageBackLink />
      <WikiEntryCard entry={data.entry} />
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Interpretation
        </h2>
        {fields.map((field) => (
          <ConfirmAndSave
            key={field}
            value={data.entry[field]}
            label={FIELD_LABELS[field]}
            buildInput={(next) => ({
              data: { entryId: data.entry.id, field, value: next },
            })}
            mutationFn={editMirrorField}
            invalidate={[
              ['wiki', STUDENT_ID, entryId],
              ['wiki', STUDENT_ID],
            ]}
          />
        ))}
      </section>
      <details className="border-t border-border/70 pt-4 text-xs">
        <summary className="cursor-pointer font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Transcript
        </summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{data.entry.transcript}</p>
      </details>
      <MirrorEvalReviewPanel review={evalReview} showEmpty />
      <ConnectedVipsLinks entries={data.connected_vips_entries} />
    </section>
  )
}

function PageBackLink() {
  return (
    <Link to="/" className="w-fit text-xs font-medium text-muted-foreground hover:text-foreground">
      ← Island
    </Link>
  )
}
