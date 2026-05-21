/**
 * U8 — Confirm a single staged-diff entry. Inserts the entry into
 * `vips_timeline_entries`, upserts the dimension's `vips_pages` row on
 * first confirm in that dimension within this batch, marks the entry
 * `resolved: 'confirmed'` inside the staging row's payload, and (when
 * the batch is fully resolved) flips the staging row's status to
 * `'confirmed'` + stamps `reviewed_at`.
 *
 * All DB writes are wrapped in one Postgres transaction (via
 * `withStudent` from `~/db/client`) so the timeline insert + page upsert
 * + payload mutation + (possibly) status flip succeed or fail atomically.
 */
import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import {
  getVipsProposedDiff,
  insertVipsTimelineEntry,
  updateVipsProposedDiffPayload,
  updateVipsProposedDiffStatus,
  upsertVipsPage,
  type VipsProposedDiffRow,
} from '~/db/queries'
import {
  checkOutputForDiagnosticLanguage,
  checkPersonalityRewriteForDiagnosticLanguage,
  type SafetyCheckResult,
} from '~/lib/safety'
import {
  allEntriesResolved,
  buildReviewEntryId,
  parseReviewPayload,
  type ReviewableAnnotatedEntry,
  type ReviewPayload,
} from '~/server/review-payload-shape'
import { type ConfirmDiffInput, confirmDiffInputSchema } from './function-schemas'

export class ConfirmDiffError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfirmDiffError'
  }
}

export interface ConfirmDiffResult {
  diff: VipsProposedDiffRow
  /**
   * Set when the compiled_truth_rewrite for this dimension tripped the
   * diagnostic-language guard (#1, #3): the timeline entry was still
   * committed (student-speech is the canonical record), but the vips_pages
   * row was NOT updated — the previously-committed compiled_truth (if any)
   * remains in place. Surface this so the UI can show "your reflection
   * was saved, but the library summary kept its previous version."
   */
  compiled_truth_safety_skip?: {
    dimension: string
    matches: SafetyCheckResult['matches']
  }
}

export interface ConfirmDiffDeps {
  requireContext?: typeof requireCounselorContext
  withStudent?: typeof withStudent
  getVipsProposedDiff?: typeof getVipsProposedDiff
  insertVipsTimelineEntry?: typeof insertVipsTimelineEntry
  updateVipsProposedDiffPayload?: typeof updateVipsProposedDiffPayload
  updateVipsProposedDiffStatus?: typeof updateVipsProposedDiffStatus
  upsertVipsPage?: typeof upsertVipsPage
}

/**
 * Returns the matching guard for a dimension. Personality uses the
 * stricter rewrite-aware patterns (U7) because the third-person voice
 * of compiled_truth_rewrite is the highest-risk surface for slipping
 * into diagnostic labels. Values/Interests/Skills get the base sweep.
 */
function checkCompiledTruthForDimension(dimension: string, text: string): SafetyCheckResult {
  if (dimension === 'personality') {
    return checkPersonalityRewriteForDiagnosticLanguage(text)
  }
  return checkOutputForDiagnosticLanguage(text)
}

export async function confirmDiffHandler(
  data: ConfirmDiffInput,
  deps: ConfirmDiffDeps = {},
): Promise<ConfirmDiffResult> {
  const parsed = confirmDiffInputSchema.parse(data)
  const { studentId } = await (deps.requireContext ?? requireCounselorContext)()
  return (deps.withStudent ?? withStudent)(studentId, async (ctx) => {
    const row = await (deps.getVipsProposedDiff ?? getVipsProposedDiff)(studentId, parsed.diffId, {
      ctx,
    })
    if (!row) throw new ConfirmDiffError(`Staged diff ${parsed.diffId} not found`)
    if (row.status !== 'pending') {
      throw new ConfirmDiffError(
        `Staged diff ${parsed.diffId} is not pending (status=${row.status})`,
      )
    }

    const payload = parseReviewPayload(row.payload)
    const located = locateEntry(payload, parsed.entryId)
    if (!located) {
      throw new ConfirmDiffError(`Entry ${parsed.entryId} not found in diff ${parsed.diffId}`)
    }
    const { entry } = located
    if (entry.resolved === 'confirmed') {
      throw new ConfirmDiffError(`Entry ${parsed.entryId} is already confirmed`)
    }
    if (entry.resolved === 'forgotten') {
      throw new ConfirmDiffError(`Entry ${parsed.entryId} was already forgotten`)
    }

    const dimension = entry.dimension
    // First confirm in this dimension within this batch? If yes, upsert
    // the dimension's vips_pages row with the agent's compiled-truth
    // rewrite. We look at the snapshot BEFORE flipping `entry.resolved`
    // and scan BOTH lists — a prior confirm in `admitted` must suppress
    // a redundant upsert for the same dimension's `downgraded` confirm
    // (and vice-versa). Scanning only `payload[list]` missed the cross-
    // list case; world-studio fix carried forward through the rebase.
    const isFirstConfirmInDimension = ![...payload.admitted, ...payload.downgraded].some(
      (e) => e.dimension === dimension && e.resolved === 'confirmed',
    )

    // Insert into vips_timeline_entries. Verifier-owned annotations
    // (reinforces_id, etc.) are carried from the staged entry; the
    // canonical_claim_id / verbatim_quote / reflection_id came from
    // the agent's draft and survived the verifier gate (admitted or
    // downgraded).
    await (deps.insertVipsTimelineEntry ?? insertVipsTimelineEntry)(
      studentId,
      {
        dimension,
        canonical_claim_id: entry.canonical_claim_id,
        verbatim_quote: entry.verbatim_quote,
        reflection_id: entry.reflection_id,
        strength: entry.strength,
        parallax_tag: entry.parallax_tag,
        reinforces_id: entry.reinforces_id ?? null,
      },
      { ctx },
    )

    // Captured outside the `if` so we can attach it to the result.
    let compiled_truth_safety_skip: ConfirmDiffResult['compiled_truth_safety_skip']

    if (isFirstConfirmInDimension) {
      // Design note (Known Residual #2): `compiled_truth_rewrite` is an
      // agent-rewritten holistic summary of the dimension. The Connector
      // prompt is responsible for grounding it in all non-forgotten
      // timeline entries we hand it as context. R2's preservation rule
      // is enforced by the append-only `vips_timeline_entries` table —
      // forgetting one entry just flips a flag; the next Connector pass
      // sees the surviving entries and rewrites compiled_truth from
      // scratch. The compiled_truth string is therefore presentation;
      // the timeline is canon.
      const dimDiff = payload.diffs[dimension as keyof typeof payload.diffs]

      // R28/R29 + U7 — per-dimension diagnostic-language guard on the
      // compiled_truth_rewrite. Personality has always had a render-time
      // guard (counsellor-brief-renderer); this gate adds the same check
      // for Values/Interests/Skills using the base sweep, and runs the
      // stricter rewrite-aware patterns for Personality.
      //
      // On flag: log + skip the page upsert. The timeline entry still
      // commits (student speech is canonical, not the holistic summary)
      // and the previously-committed compiled_truth — if any — stays in
      // place. The next Connector pass will re-attempt with the new
      // surviving entries; this prevents a one-bad-rewrite from
      // overwriting an earlier clean summary.
      const safety = checkCompiledTruthForDimension(dimension, dimDiff.compiled_truth_rewrite)
      if (!safety.ok) {
        // eslint-disable-next-line no-console -- structural log for ops
        console.warn(
          '[confirm-diff] compiled_truth_rewrite tripped diagnostic-language guard; ' +
            `skipping vips_pages upsert. student=${studentId} dimension=${dimension} ` +
            `matches=${JSON.stringify(safety.matches)}`,
        )
        compiled_truth_safety_skip = { dimension, matches: safety.matches }
      } else {
        await (deps.upsertVipsPage ?? upsertVipsPage)(
          studentId,
          {
            dimension,
            compiled_truth: dimDiff.compiled_truth_rewrite,
            open_question: dimDiff.open_question,
          },
          { ctx },
        )
      }
    }

    // Mutate the in-payload resolution flag and persist it.
    entry.resolved = 'confirmed'
    const updated =
      (await (deps.updateVipsProposedDiffPayload ?? updateVipsProposedDiffPayload)(
        studentId,
        parsed.diffId,
        payload,
        { ctx },
      )) ?? row

    // If this was the last unresolved entry across all dimensions in
    // the diff, flip the staging row's status to 'confirmed' and stamp
    // reviewed_at. We treat any resolution outcome (including
    // forget-only batches) as "confirmed" because the diff was
    // *reviewed* — see forget-diff.handler.server.ts for the parallel
    // rule.
    if (allEntriesResolved(payload)) {
      const finalRow = await (deps.updateVipsProposedDiffStatus ?? updateVipsProposedDiffStatus)(
        studentId,
        parsed.diffId,
        'confirmed',
        { ctx },
      )
      return { diff: finalRow ?? updated, compiled_truth_safety_skip }
    }
    return { diff: updated, compiled_truth_safety_skip }
  })
}

function locateEntry(
  payload: ReviewPayload,
  entryId: string,
): { entry: ReviewableAnnotatedEntry; list: 'admitted' | 'downgraded' } | null {
  for (const list of ['admitted', 'downgraded'] as const) {
    const found = payload[list].find((e) => buildReviewEntryId(e) === entryId)
    if (found) return { entry: found, list }
  }
  return null
}
