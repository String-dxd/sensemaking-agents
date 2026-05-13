import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MirrorEvalReviewBadge, parseMirrorEvalReview } from '~/components/MirrorEvalReview'
import { MirrorReflectionSections } from '~/components/MirrorReflectionSections'
import { Button } from '~/components/ui/button'
import type { MirrorEntryRow } from '~/db/queries'
import { loadWiki } from '~/server/load-wiki.functions'
import { runConnector } from '~/server/run-connector.functions'
import { bulkUpdateMirrorReview, updateMirrorReview } from '~/server/update-mirror-review.functions'

export type ReflectionsFilter = 'all' | 'need-review'

export interface ReflectionsSheetViewProps {
  studentId: string
  filter: ReflectionsFilter
  onFilterChange: (filter: ReflectionsFilter) => void
}

export function ReflectionsSheetView({
  studentId,
  filter,
  onFilterChange,
}: ReflectionsSheetViewProps) {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ['wiki', studentId],
    queryFn: () => loadWiki({ data: {} }),
  })

  const connector = useMutation({
    mutationFn: () => runConnector({ data: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vips-pages', studentId] })
      qc.invalidateQueries({ queryKey: ['wiki', studentId] })
      qc.invalidateQueries({ queryKey: ['trajectory', studentId] })
    },
  })

  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2"
      data-testid="reflections-sheet"
    >
      <header className="grid gap-4 border-b border-border/70 pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Library
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">Recorded thoughts</h2>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Confirm what still fits. Connector turns confirmed thoughts into the profile pages.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="accent"
          disabled={connector.isPending}
          onClick={() => connector.mutate()}
          data-testid="sheet-run-connector"
        >
          {connector.isPending ? 'connecting…' : 'Run Connector'}
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReflectionsFilterBar
          filter={filter}
          pendingReviewCount={
            data?.entries.filter((entry) => entry.review_status === 'pending').length ?? 0
          }
          onChange={onFilterChange}
        />
        {connector.isSuccess ? (
          <p className="text-xs text-muted-foreground" data-testid="sheet-run-connector-status">
            {connectorStatusCopy(
              connector.data.status,
              connector.data.processed,
              connector.data.remaining,
            )}
          </p>
        ) : null}
        {connector.isError ? (
          <p className="text-xs text-warning" role="alert">
            {connector.error instanceof Error ? connector.error.message : 'Connector failed'}
          </p>
        ) : null}
      </div>

      {isPending ? <p className="text-sm text-muted-foreground">loading thoughts…</p> : null}
      {data ? (
        <ReflectionsList entries={data.entries} filter={filter} studentId={studentId} />
      ) : null}
    </section>
  )
}

function ReflectionsList({
  entries,
  filter,
  studentId,
}: {
  entries: MirrorEntryRow[]
  filter: ReflectionsFilter
  studentId: string
}) {
  const qc = useQueryClient()
  const pendingEntries = entries.filter((entry) => entry.review_status === 'pending')
  const visibleEntries = filter === 'need-review' ? pendingEntries : entries

  const updateOne = useMutation({
    mutationFn: (input: { entryId: number; status: 'confirmed' | 'forgotten' }) =>
      updateMirrorReview({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', studentId] }),
  })

  const updateAll = useMutation({
    mutationFn: (status: 'confirmed' | 'forgotten') => bulkUpdateMirrorReview({ data: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', studentId] }),
  })

  if (visibleEntries.length === 0 && filter === 'all') {
    return (
      <div className="border-t border-border/70 pt-5 text-sm text-muted-foreground">
        No thoughts recorded yet.
      </div>
    )
  }

  if (visibleEntries.length === 0) {
    return (
      <div className="border-t border-border/70 pt-5 text-sm text-muted-foreground">
        No recorded thoughts are waiting for confirm or forget.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {pendingEntries.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {pendingEntries.length} waiting
          </span>
          <Button
            type="button"
            size="sm"
            variant="accent"
            disabled={updateAll.isPending}
            onClick={() => updateAll.mutate('confirmed')}
            data-testid="sheet-confirm-all-mirrors"
          >
            Confirm all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updateAll.isPending}
            onClick={() => updateAll.mutate('forgotten')}
            data-testid="sheet-forget-all-mirrors"
          >
            Forget all
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col" data-testid="sheet-reflections-list">
        {visibleEntries.map((entry) => (
          <ReflectionCard
            key={entry.id}
            entry={entry}
            disabled={updateOne.isPending || updateAll.isPending}
            onConfirm={() => updateOne.mutate({ entryId: entry.id, status: 'confirmed' })}
            onForget={() => updateOne.mutate({ entryId: entry.id, status: 'forgotten' })}
          />
        ))}
      </ul>
    </div>
  )
}

function ReflectionsFilterBar({
  filter,
  pendingReviewCount,
  onChange,
}: {
  filter: ReflectionsFilter
  pendingReviewCount: number
  onChange: (filter: ReflectionsFilter) => void
}) {
  return (
    <div
      className="flex w-fit flex-wrap items-center gap-1 rounded-full bg-muted p-1"
      data-testid="sheet-reflections-filter-bar"
    >
      <Button
        type="button"
        size="sm"
        variant={filter === 'all' ? 'default' : 'ghost'}
        className="rounded-full"
        onClick={() => onChange('all')}
        data-testid="sheet-reflections-filter-all"
      >
        All recorded
      </Button>
      <Button
        type="button"
        size="sm"
        variant={filter === 'need-review' ? 'default' : 'ghost'}
        className="rounded-full"
        onClick={() => onChange('need-review')}
        data-testid="sheet-reflections-filter-need-review"
      >
        Need review{pendingReviewCount > 0 ? ` (${pendingReviewCount})` : ''}
      </Button>
    </div>
  )
}

function ReflectionCard({
  entry,
  disabled,
  onConfirm,
  onForget,
}: {
  entry: MirrorEntryRow
  disabled: boolean
  onConfirm: () => void
  onForget: () => void
}) {
  const evalReview = parseMirrorEvalReview(entry.raw_output_json)
  return (
    <li
      id={`reflection-${entry.id}`}
      className="border-t border-border/70 py-5 first:border-t-0 first:pt-0"
      data-testid={`sheet-mirror-entry-${entry.id}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Reflection #{entry.id}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(entry.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {entry.review_status === 'pending' ? 'needs review' : entry.review_status}
            </span>
            <MirrorEvalReviewBadge review={evalReview} />
          </div>
        </div>

        <MirrorReflectionSections entry={entry} compact />

        <details className="text-xs">
          <summary className="cursor-pointer font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Transcript
          </summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground">
            {entry.transcript}
          </p>
        </details>
        {entry.review_status === 'pending' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={disabled}
              onClick={onConfirm}
            >
              Confirm
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={onForget}
            >
              Forget
            </Button>
          </div>
        ) : null}
        <Link
          to="/library/entries/$entryId"
          params={{ entryId: String(entry.id) }}
          className="w-fit text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          open detail →
        </Link>
      </div>
    </li>
  )
}

function connectorStatusCopy(status: string, processed: number, remaining: number): string {
  switch (status) {
    case 'ok':
      return `Connector linked ${processed} ${processed === 1 ? 'reflection' : 'reflections'}.`
    case 'nothing_to_run':
      return 'Connector found no unconnected reflections.'
    case 'partial':
      return `Connector linked what it could; ${remaining} still waiting.`
    case 'timeout':
      return 'Connector timed out before linking a reflection.'
    case 'schema_reject':
      return 'Connector returned an invalid diff.'
    case 'transport_error':
      return 'Connector transport failed.'
    case 'auth_error':
      return 'Connector auth failed.'
    default:
      return 'Connector stopped before finishing.'
  }
}
