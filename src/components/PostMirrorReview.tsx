/**
 * U8 — Post-Mirror review surface. Renders one staged diff grouped by
 * VIPS dimension. Each entry has a `verified ✓` / `aspirational ⚠` /
 * `partial match` badge, a verbatim quote, the canonical claim ID, and
 * confirm / forget buttons. Dropped entries collapse into a
 * "Quotes we couldn't find in your reflection" section (read-only).
 *
 * Done is disabled until every admitted/downgraded entry is resolved
 * (confirmed or forgotten). Dropped entries are pre-resolved by the
 * verifier and do not count toward the gate.
 *
 * Mutations follow the `ConfirmAndSave.tsx` pattern: per-entry confirm
 * and forget call their server fn and invalidate the
 * `['pending-review', studentId]` query so the route loader re-reads
 * the staged payload after every action.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useMemo } from 'react'
import type {
  VerifierAnnotatedEntry,
  VerifierDroppedEntry,
  VipsContextType,
} from '~/agents/tools/schemas'
import { ContextTypePicker } from '~/components/ContextTypePicker'
import { Button } from '~/components/ui/button'
import type { VipsProposedDiffRow } from '~/db/queries'
import { confirmDiff } from '~/server/confirm-diff.functions'
import { forgetDiff } from '~/server/forget-diff.functions'
import {
  buildReviewEntryId,
  parseReviewPayload,
  type ReviewableAnnotatedEntry,
  type ReviewPayload,
} from '~/server/review-payload-shape'
import { updateReviewContext } from '~/server/update-review-context.functions'

const DIMENSIONS = ['values', 'interests', 'personality', 'skills'] as const
type Dimension = (typeof DIMENSIONS)[number]

const DIMENSION_LABEL: Record<Dimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

export interface PostMirrorReviewProps {
  studentId: string
  diff: VipsProposedDiffRow
  /** Called after Done is clicked — typically to navigate back to the library. */
  onDone?: () => void
  title?: string
  description?: string
  /** When embedded in Library's "Need review" filter, hide resolved rows. */
  onlyPending?: boolean
}

export function PostMirrorReview({
  studentId,
  diff,
  onDone,
  title = 'Review',
  description = "The Connector pulled these claims from your last reflection. Confirm what fits, forget what doesn't. Forgotten entries never reach your library.",
  onlyPending = false,
}: PostMirrorReviewProps) {
  const qc = useQueryClient()
  const payload = useMemo(() => parseReviewPayload(diff.payload), [diff.payload])
  const reviewables = useMemo(() => [...payload.admitted, ...payload.downgraded], [payload])
  const pendingEntries = useMemo(
    () => reviewables.filter((e) => e.resolved === 'pending'),
    [reviewables],
  )
  const visibleReviewables = onlyPending ? pendingEntries : reviewables
  const inferredContext = firstContextType(pendingEntries) ?? firstContextType(reviewables)
  const allResolved = reviewables.length === 0 || pendingEntries.length === 0

  const invalidateReviewAndLibrary = () => {
    void qc.invalidateQueries({ queryKey: ['pending-review', studentId] })
    void qc.invalidateQueries({ queryKey: ['vips-pages', studentId] })
    void qc.invalidateQueries({ queryKey: ['trajectory', studentId] })
  }

  // Bulk confirm — fires sequentially because each `confirmDiff` mutates the
  // same staged row's `payload_json` inside a transaction. Concurrent confirms
  // would race on last-write-wins for the resolution flags, lose entries, and
  // potentially mis-fire the last-entry-resolved status flip.
  const bulkConfirmMutation = useMutation({
    mutationFn: async () => {
      for (const entry of pendingEntries) {
        await confirmDiff({
          data: { diffId: diff.id, entryId: buildReviewEntryId(entry) },
        })
      }
    },
    onSuccess: invalidateReviewAndLibrary,
  })

  const bulkForgetMutation = useMutation({
    mutationFn: async () => {
      for (const entry of pendingEntries) {
        await forgetDiff({
          data: { diffId: diff.id, entryId: buildReviewEntryId(entry) },
        })
      }
    },
    onSuccess: invalidateReviewAndLibrary,
  })

  const updateContextMutation = useMutation({
    mutationFn: (contextType: VipsContextType) =>
      updateReviewContext({ data: { diffId: diff.id, context_type: contextType } }),
    onSuccess: invalidateReviewAndLibrary,
  })

  const bulkActionPending = bulkConfirmMutation.isPending || bulkForgetMutation.isPending

  return (
    <section className="flex flex-col gap-6 py-6" data-testid="post-mirror-review">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      </header>

      {onlyPending && inferredContext ? (
        <section
          className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 p-4"
          data-testid="review-context-editor"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Inferred context
              </h2>
              <p className="text-xs text-muted-foreground">
                Change this before confirming if the reflection was about something else.
              </p>
            </div>
            {updateContextMutation.isPending ? (
              <span className="text-xs text-muted-foreground">saving…</span>
            ) : null}
            {updateContextMutation.isError ? (
              <span className="text-xs text-warning" role="alert">
                {updateContextMutation.error instanceof Error
                  ? updateContextMutation.error.message
                  : 'context update failed'}
              </span>
            ) : null}
          </div>
          <ContextTypePicker
            label="About"
            defaultValue={inferredContext}
            onSelect={(value) => updateContextMutation.mutate(value)}
          />
        </section>
      ) : null}

      {visibleReviewables.length > 0 ? (
        <div className="flex flex-col gap-8">
          {DIMENSIONS.map((dim) => (
            <DimensionGroup
              key={dim}
              dimension={dim}
              diff={diff}
              payload={payload}
              entries={visibleReviewables.filter((e) => e.dimension === dim)}
              studentId={studentId}
              disableActions={bulkActionPending}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border/40 bg-muted/10 p-4 text-sm text-muted-foreground">
          Everything in this batch has been reviewed.
        </div>
      )}

      {onlyPending ? null : <DroppedSection dropped={payload.dropped} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="default"
          size="sm"
          onClick={() => onDone?.()}
          disabled={!allResolved || bulkActionPending}
          data-testid="review-done"
        >
          Done
        </Button>
        {pendingEntries.length > 0 ? (
          <Button
            variant="accent"
            size="sm"
            onClick={() => bulkConfirmMutation.mutate()}
            disabled={bulkActionPending}
            data-testid="review-confirm-all"
          >
            {bulkConfirmMutation.isPending
              ? `Confirming ${pendingEntries.length}…`
              : `Confirm all ${pendingEntries.length}`}
          </Button>
        ) : null}
        {pendingEntries.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkForgetMutation.mutate()}
            disabled={bulkActionPending}
            data-testid="review-forget-all"
          >
            {bulkForgetMutation.isPending
              ? `Forgetting ${pendingEntries.length}…`
              : `Forget all ${pendingEntries.length}`}
          </Button>
        ) : null}
        {!allResolved && !bulkActionPending ? (
          <span className="text-xs text-muted-foreground" data-testid="review-done-help">
            Confirm or forget every entry to continue.
          </span>
        ) : null}
        {bulkConfirmMutation.isError ? (
          <span
            className="text-xs text-warning"
            role="alert"
            data-testid="review-confirm-all-error"
          >
            {bulkConfirmMutation.error instanceof Error
              ? bulkConfirmMutation.error.message
              : 'confirm all failed'}
          </span>
        ) : null}
        {bulkForgetMutation.isError ? (
          <span className="text-xs text-warning" role="alert" data-testid="review-forget-all-error">
            {bulkForgetMutation.error instanceof Error
              ? bulkForgetMutation.error.message
              : 'forget all failed'}
          </span>
        ) : null}
      </div>
    </section>
  )
}

function firstContextType(entries: ReviewableAnnotatedEntry[]): VipsContextType | undefined {
  for (const entry of entries) {
    const contextType = entry.parallax_tag[0]
    if (contextType) return contextType
  }
  return undefined
}

interface DimensionGroupProps {
  dimension: Dimension
  diff: VipsProposedDiffRow
  payload: ReviewPayload
  entries: ReviewableAnnotatedEntry[]
  studentId: string
  disableActions?: boolean
}

function DimensionGroup({
  dimension,
  diff,
  payload,
  entries,
  studentId,
  disableActions,
}: DimensionGroupProps) {
  const dimDiff = payload.diffs[dimension]

  if (entries.length === 0) return null

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/10 p-4"
      data-testid={`dimension-group-${dimension}`}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {DIMENSION_LABEL[dimension]}
        </h2>
        {dimDiff.compiled_truth_rewrite ? (
          <div className="rounded border border-border/30 bg-background/60 p-3 text-xs">
            <p className="text-muted-foreground">
              If you confirm any claim in this dimension, this is how your page will read:
            </p>
            <p className="mt-1 leading-relaxed">{dimDiff.compiled_truth_rewrite}</p>
            {dimDiff.open_question ? (
              <p className="mt-2 text-muted-foreground">
                <span className="font-medium">Open question:</span> {dimDiff.open_question}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <EntryRow
            key={buildReviewEntryId(entry)}
            entry={entry}
            diffId={diff.id}
            studentId={studentId}
            disableActions={disableActions}
          />
        ))}
      </ul>
    </section>
  )
}

interface EntryRowProps {
  entry: ReviewableAnnotatedEntry
  diffId: number
  studentId: string
  disableActions?: boolean
}

function EntryRow({ entry, diffId, studentId, disableActions }: EntryRowProps) {
  const qc = useQueryClient()
  const entryId = buildReviewEntryId(entry)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pending-review', studentId] })
    void qc.invalidateQueries({ queryKey: ['vips-pages', studentId] })
    void qc.invalidateQueries({ queryKey: ['trajectory', studentId] })
  }

  const confirmMutation = useMutation({
    mutationFn: () => confirmDiff({ data: { diffId, entryId } }),
    onSuccess: invalidate,
  })

  const forgetMutation = useMutation({
    mutationFn: () => forgetDiff({ data: { diffId, entryId } }),
    onSuccess: invalidate,
  })

  const verdict = verdictForEntry(entry)
  const pending = confirmMutation.isPending || forgetMutation.isPending || disableActions === true
  const resolved = entry.resolved !== 'pending'

  return (
    <li
      className="flex flex-col gap-2 rounded border border-border/40 bg-background/40 p-3 text-sm"
      data-testid={`entry-row-${entryId}`}
      data-resolved={entry.resolved}
    >
      <div className="flex items-center justify-between gap-2">
        <VerdictBadge verdict={verdict} />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {entry.canonical_claim_id}
        </span>
      </div>
      <blockquote className="border-l-2 border-border/60 pl-3 italic leading-relaxed">
        “{entry.verbatim_quote}”
      </blockquote>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="accent"
          onClick={() => confirmMutation.mutate()}
          disabled={pending || resolved}
          data-testid={`confirm-${entryId}`}
        >
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => forgetMutation.mutate()}
          disabled={pending || resolved}
          data-testid={`forget-${entryId}`}
        >
          Forget
        </Button>
        {entry.resolved === 'confirmed' ? (
          <span className="text-xs text-muted-foreground">confirmed</span>
        ) : null}
        {entry.resolved === 'forgotten' ? (
          <span className="text-xs text-muted-foreground">forgotten</span>
        ) : null}
        {confirmMutation.isError ? (
          <span className="text-xs text-warning" role="alert">
            {confirmMutation.error instanceof Error
              ? confirmMutation.error.message
              : 'confirm failed'}
          </span>
        ) : null}
        {forgetMutation.isError ? (
          <span className="text-xs text-warning" role="alert">
            {forgetMutation.error instanceof Error ? forgetMutation.error.message : 'forget failed'}
          </span>
        ) : null}
      </div>
    </li>
  )
}

type Verdict = 'verified' | 'aspirational' | 'partial-match'

function verdictForEntry(entry: VerifierAnnotatedEntry): Verdict {
  if (entry.aspirational) return 'aspirational'
  if (entry.partial_match) return 'partial-match'
  return 'verified'
}

function VerdictBadge({ verdict }: { verdict: Verdict }): ReactNode {
  if (verdict === 'verified') {
    return (
      <span
        className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent"
        data-testid="verdict-verified"
      >
        verified ✓
      </span>
    )
  }
  if (verdict === 'aspirational') {
    return (
      <span
        className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning"
        data-testid="verdict-aspirational"
      >
        aspirational ⚠
      </span>
    )
  }
  return (
    <span
      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      data-testid="verdict-partial"
    >
      partial match
    </span>
  )
}

function DroppedSection({ dropped }: { dropped: VerifierDroppedEntry[] }) {
  if (dropped.length === 0) return null
  return (
    <details
      className="rounded-lg border border-border/30 bg-muted/10 p-3 text-xs"
      data-testid="dropped-section"
    >
      <summary className="cursor-pointer text-muted-foreground">
        Quotes we couldn’t find in your reflection ({dropped.length})
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {dropped.map((d) => (
          <li
            // dimension + canonical_claim_id + reason + quote is unique enough
            // for a dropped batch (the verifier never emits two dropped entries
            // with the same canonical_claim_id + verbatim_quote + reason).
            key={`${d.entry.dimension}::${d.entry.canonical_claim_id}::${d.reason}::${d.entry.verbatim_quote}`}
            className="rounded border border-border/30 bg-background/40 p-2"
            data-testid="dropped-entry"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium uppercase tracking-wide text-[10px] text-muted-foreground">
                {d.entry.dimension} · {d.entry.canonical_claim_id}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {d.reason === 'no_quote_match' ? 'no quote match' : 'unknown reflection'}
              </span>
            </div>
            <blockquote className="mt-1 border-l-2 border-border/40 pl-2 italic leading-relaxed">
              “{d.entry.verbatim_quote}”
            </blockquote>
          </li>
        ))}
      </ul>
    </details>
  )
}
