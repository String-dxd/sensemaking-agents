/**
 * U7 — Auto-Connector chain that runs after every successful `persistMirror`.
 *
 * Orchestration (no LLM call in tests; deps stubs the agent):
 *   1. Read the student's existing VIPS pages + non-forgotten timeline
 *      entries via `withStudent` (Postgres transaction with `app.student_id`
 *      bound for RLS).
 *   2. Format the prompt context (new mirror entry + its context_type +
 *      page snapshots).
 *   3. Call the Connector (real or stubbed via `deps.runConnector`). Race
 *      against a 30s soft budget.
 *   4. Parse against `ConnectorDiffSchema`; malformed JSON → `schema_reject`.
 *   5. Flatten the per-dimension diffs into one verifier-shaped
 *      `timeline_entries` list and hand to the verifier (U6).
 *   6. Persist the diff + verifier annotations to `vips_proposed_diffs`
 *      with `status='pending'`; return the staged row to the caller.
 *
 * Mirror reflection is NEVER blocked by Connector failure (A11) — the
 * `persistMirror` handler already inserted the mirror entry before invoking
 * this chain. On every failure mode the staged-diff row is simply omitted;
 * the mirror entry is intact.
 */
import { ZodError } from 'zod'
import { getManagedAgentBinding } from '~/agents/config'
import { buildConnectorContext } from '~/agents/context'
import {
  appendIfNovel,
  appendStudentMemory,
  getOrCreateMemoryStoreId,
  MEMORY_FILE_PATHS,
  type MemoryStoreTransport,
  MemoryWriteError,
} from '~/agents/memory'
import { ManagedAgentError, runManagedAgent } from '~/agents/runner'
import {
  type ConnectorDiffDraft,
  ConnectorDiffSchema,
  type ConnectorDimension,
} from '~/agents/schemas'
import type {
  ProposedTimelineEntryDraft,
  VerifierExistingTimelineEntry,
  VerifierMirrorEntry,
  VerifierResult,
} from '~/agents/tools/schemas'
import { verifyProposedDiff } from '~/agents/verifier'
import { VIPS_DIMENSIONS as TAXONOMY_VIPS_DIMENSIONS } from '~/data/vips-taxonomy'
import { type TenantContext, withStudent } from '~/db/client'
import {
  getMirrorEntry,
  insertVipsProposedDiffIfNoPending,
  listVipsPages,
  listVipsProposedDiffs,
  listVipsTimelineEntries,
  type VipsPageRow,
  type VipsProposedDiffRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'

/** 30s soft budget per plan Approach ("Wall-clock budget: 30s soft timeout"). */
export const AUTO_CONNECTOR_TIMEOUT_MS = 30_000

// Re-typed to the Connector's narrowed dimension union (which is a subset
// of `VipsDimension` literals — they are byte-equivalent today but the
// schema-layer alias keeps the type-level provenance honest).
const VIPS_DIMENSIONS = TAXONOMY_VIPS_DIMENSIONS as readonly ConnectorDimension[]

/**
 * Auto-Connector status values surfaced to the caller (and to the UI via
 * `persistMirror`'s response). Closed enum so U8's review surface can
 * render specific copy per outcome.
 *
 * - `ok`: Connector ran, output parsed, verifier ran, diff staged.
 * - `queued`: R30 — a prior `status='pending'` row exists; new run skipped.
 * - `timeout`: Connector did not return inside `AUTO_CONNECTOR_TIMEOUT_MS`.
 * - `schema_reject`: Connector returned a payload that failed `ConnectorDiffSchema`
 *   (Zod parse error). The mirror entry is still persisted (A11).
 * - `transport_error`: OpenAI SDK or network error (5xx, ECONNRESET, fetch
 *   abort). Likely transient — caller can retry.
 * - `auth_error`: OpenAI SDK returned 401 / 403. Configuration problem;
 *   retry will not help.
 * - `unknown`: Any other thrown error in the Connector call path. Catch-all
 *   so we never silently leak an exception into the persistMirror flow.
 * - `missing_mirror`: Defensive — caller passed a mirror_entry_id that is
 *   not visible under `withStudent(studentId)`. Should not happen in
 *   practice because `persistMirror` invokes this with the row it just
 *   inserted.
 *
 * (Finding #7: previous versions collapsed every non-timeout failure mode
 * into `schema_reject`, which was useless for ops triage.)
 */
export type AutoConnectorStatus =
  | 'ok'
  | 'queued'
  | 'timeout'
  | 'schema_reject'
  | 'transport_error'
  | 'auth_error'
  | 'unknown'
  | 'missing_mirror'

export interface AutoConnectorResult {
  status: AutoConnectorStatus
  staged_diff: VipsProposedDiffRow | null
  /** Present when status is 'queued' — the prior pending diff id. */
  pending_diff_id?: number
}

export interface AutoConnectorDeps {
  /**
   * Test seam: bypass the agent runner and return a pre-baked Connector
   * draft. When omitted, the handler dispatches via `runManagedAgent`.
   */
  runConnector?: (input: {
    studentId: string
    mirrorEntry: VerifierMirrorEntry
    pages: VipsPageRow[]
    timeline: VipsTimelineEntryRow[]
  }) => Promise<unknown>
  /**
   * Test seam: bypass `verifyProposedDiff`. Real callers leave this
   * undefined and the deterministic U6 verifier runs.
   */
  verify?: (input: {
    diff: { timeline_entries: ProposedTimelineEntryDraft[] }
    mirrorEntry: VerifierMirrorEntry
    existingTimelineEntries: VerifierExistingTimelineEntry[]
  }) => VerifierResult
  /** Override the Anthropic memory-store transport for the rejected-diff append. */
  memoryTransport?: MemoryStoreTransport
}

export async function runAutoConnectorAfterMirror(
  studentId: string,
  mirrorEntryId: number,
  deps: AutoConnectorDeps = {},
): Promise<AutoConnectorResult> {
  return withStudent(studentId, async (ctx) => {
    // ── R30 pending-queue rule — check BEFORE invoking the agent. ──
    // Avoid `existingPending.length > 0` followed by `existingPending[0]`;
    // a single truthy check on the first element is cheaper and reads the
    // intent more directly (perf refactor from world-studio carried
    // forward onto the new async/ctx signature).
    const existingPending = await listVipsProposedDiffs(studentId, { status: 'pending', ctx })
    const prior = existingPending[0]
    if (prior) {
      return {
        status: 'queued',
        staged_diff: null,
        pending_diff_id: prior.id,
      }
    }

    const mirror = await getMirrorEntry(studentId, mirrorEntryId, { ctx })
    if (!mirror) return { status: 'missing_mirror', staged_diff: null }

    const mirrorProjection: VerifierMirrorEntry = {
      id: mirror.id,
      transcript: mirror.transcript,
      context_type: mirror.context_type,
    }

    const pages = await listVipsPages(studentId, { ctx })
    const timelineByDim = await Promise.all(
      VIPS_DIMENSIONS.map((dim) =>
        listVipsTimelineEntries(studentId, dim, { includeForgotten: false, ctx }),
      ),
    )
    const timeline: VipsTimelineEntryRow[] = timelineByDim.flat()

    // ── Step 3: invoke Connector with a soft 30s timeout. ──
    // Pass an AbortController.signal through so a timeout actually CANCELS
    // the underlying request (Finding #5). Test-seam `deps.runConnector`
    // doesn't need the signal (its mocks resolve synchronously).
    const ac = new AbortController()
    // Hoist `deps.runConnector` into a local so TypeScript narrows it inside
    // the closure (the bare `deps.runConnector` would widen back to
    // `undefined` across the function boundary and require a non-null
    // assertion — which biome flags as `noNonNullAssertion`).
    const injectedRunner = deps.runConnector
    const runner: () => Promise<unknown> = injectedRunner
      ? () =>
          injectedRunner({
            studentId,
            mirrorEntry: mirrorProjection,
            pages,
            timeline,
          })
      : () =>
          runConnectorViaManaged({
            studentId,
            newReflectionId: mirror.id,
            ctx,
            signal: ac.signal,
            ...(deps.memoryTransport ? { memoryTransport: deps.memoryTransport } : {}),
          })
    let rawDraft: unknown
    try {
      rawDraft = await raceWithTimeout(runner(), AUTO_CONNECTOR_TIMEOUT_MS, ac)
    } catch (err) {
      if (err instanceof AutoConnectorTimeoutError) {
        return { status: 'timeout', staged_diff: null }
      }
      // Finding #7: split the previously-overloaded schema_reject status into
      // discrete buckets so ops triage isn't blind. Log the underlying
      // message at each branch.
      return mapConnectorErrorToStatus(err)
    }

    // ── Step 4: parse against ConnectorDiffSchema. ──
    const parsed = ConnectorDiffSchema.safeParse(rawDraft)
    if (!parsed.success) {
      return { status: 'schema_reject', staged_diff: null }
    }
    const draft: ConnectorDiffDraft = parsed.data

    // ── Step 5: flatten + verify. ──
    const flatEntries: ProposedTimelineEntryDraft[] = flattenDiff(draft)
    const verifierInput = {
      diff: { timeline_entries: flatEntries },
      mirrorEntry: mirrorProjection,
      existingTimelineEntries: timeline.map(toVerifierExisting),
    }
    const verifierResult =
      deps.verify !== undefined ? deps.verify(verifierInput) : verifyProposedDiff(verifierInput)

    // ── Rejected-diff memory append (best-effort, non-blocking) ──
    // The verifier surfaces `dropped` entries with a structural reason
    // (`no_quote_match`, `unknown_reflection`) and `downgraded` entries with
    // `partial_match: true`. Both indicate the Connector emitted something
    // the verifier could not anchor — useful pattern signal for the next
    // run. We snapshot a compact JSON record to `/rejected-diff-patterns.md`
    // so the agent can read past rejections on its next session.
    //
    // Failure here must not block staging — the diff has already been
    // verified and is about to be inserted. Log + move on (except for the
    // diagnostic-language gate, which is a hard signal).
    if (verifierResult.dropped.length + verifierResult.downgraded.length > 0) {
      const summary = summarizeRejection({
        mirrorEntryId: mirror.id,
        dropped: verifierResult.dropped,
        downgraded: verifierResult.downgraded,
      })
      try {
        await appendStudentMemory(
          studentId,
          MEMORY_FILE_PATHS.rejectedDiffPatterns,
          appendIfNovel(summary, { source: `connector#${mirror.id}` }),
          deps.memoryTransport,
        )
      } catch (err) {
        if (err instanceof MemoryWriteError && err.code === 'DIAGNOSTIC_LANGUAGE') {
          // Rejection summary echoing a label means the Connector's draft
          // already contained one — surface it so the verifier triage owner
          // can adjust prompts. Do not block diff staging.
          // eslint-disable-next-line no-console -- ops triage signal
          console.warn(
            '[auto-connector] rejected-diff memory append blocked by diagnostic-language gate; verifier dropped/downgraded contained a label',
            { studentId, mirrorEntryId: mirror.id, summary },
          )
        } else {
          // eslint-disable-next-line no-console -- ops triage signal
          console.warn('[auto-connector] rejected-diff memory append failed; continuing', {
            studentId,
            mirrorEntryId: mirror.id,
            error: err instanceof Error ? { name: err.name, message: err.message } : err,
          })
        }
      }
    }

    // ── Step 6: persist staged diff (status='pending'). ──
    // Payload carries BOTH the agent's full per-dimension diff (compiled-
    // truth + open_question) AND the verifier's admitted/downgraded/dropped
    // partitions, so the U8 review surface has one row to render from.
    const payload = {
      diffs: draft.diffs,
      admitted: verifierResult.admitted,
      downgraded: verifierResult.downgraded,
      dropped: verifierResult.dropped,
    }
    // R30 (Finding #6): the partial-unique index
    // `vips_proposed_diffs_pending_per_student` rejects a second pending
    // row for the same student. `insertVipsProposedDiffIfNoPending` pushes
    // the decision into Postgres via INSERT … ON CONFLICT … DO NOTHING, so
    // the surrounding transaction stays live (a bare INSERT raising
    // SQLSTATE `25P02` would abort the tx and break the recovery query).
    // If a concurrent run raced past the same check above, we surface the
    // existing pending row's id as the `queued` outcome.
    const insertOutcome = await insertVipsProposedDiffIfNoPending(
      studentId,
      {
        mirror_entry_id: mirror.id,
        payload,
        verifier_result: verifierResult,
      },
      { ctx },
    )
    if (insertOutcome.inserted) {
      return { status: 'ok' as const, staged_diff: insertOutcome.row }
    }
    return {
      status: 'queued' as const,
      staged_diff: null,
      pending_diff_id: insertOutcome.existing.id,
    }
  })
}

/**
 * Map a thrown Connector error to one of the discrete AutoConnectorStatus
 * buckets (Finding #7). The previous implementation collapsed every
 * non-timeout failure mode into `schema_reject`, which gave operators no
 * signal — was the LLM rate-limited? Was our API key revoked? Was the
 * SDK 5xx-ing on us? Were they returning malformed JSON? — all of these
 * collapsed into one log line.
 *
 * Duck-typing on a `status: number` field rather than `instanceof
 * APIError` so we don't pull the openai SDK error class into our
 * top-level imports (and survive minor SDK version drift).
 */
function mapConnectorErrorToStatus(err: unknown): AutoConnectorResult {
  if (err instanceof ZodError) {
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn('[auto-connector] schema_reject: Zod parse error on Connector output', {
      issues: err.issues,
    })
    return { status: 'schema_reject', staged_diff: null }
  }

  // Managed Agents path — `runManagedAgent` throws `ManagedAgentError` with
  // a discrete `code`. Map them onto the existing AutoConnectorStatus enum
  // so the U8 review surface keeps a single failure-mode contract regardless
  // of which runtime produced the error.
  if (err instanceof ManagedAgentError) {
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn(`[auto-connector] managed-agent ${err.code}`, { message: err.message })
    switch (err.code) {
      case 'PARSE_ERROR':
        return { status: 'schema_reject', staged_diff: null }
      case 'NO_API_KEY':
        return { status: 'auth_error', staged_diff: null }
      case 'STREAM_ERROR':
      case 'TERMINATED':
      case 'RETRIES_EXHAUSTED':
      case 'NO_OUTPUT':
      case 'REQUIRES_ACTION':
        return { status: 'transport_error', staged_diff: null }
      case 'TIMEOUT':
        // The handler's own AbortController-based timeout wins first; this
        // path is the runner's hard backstop. Surface as `timeout` so ops
        // triage sees a consistent status across runtimes.
        return { status: 'timeout', staged_diff: null }
      default:
        return { status: 'unknown', staged_diff: null }
    }
  }

  // Duck-type the OpenAI SDK error shape (APIError carries a numeric `status`).
  const status =
    err && typeof err === 'object' && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined
  const message =
    err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : String(err)

  if (status === 401 || status === 403) {
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn(`[auto-connector] auth_error: Connector SDK returned ${status}`, { message })
    return { status: 'auth_error', staged_diff: null }
  }
  if (typeof status === 'number' && status >= 500 && status < 600) {
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn(`[auto-connector] transport_error: Connector SDK ${status}`, { message })
    return { status: 'transport_error', staged_diff: null }
  }
  // APIConnectionError / APIConnectionTimeoutError have no numeric status
  // but are still transport-class. Match on a few common name suffixes.
  const name =
    err && typeof err === 'object' && typeof (err as { name?: unknown }).name === 'string'
      ? (err as { name: string }).name
      : ''
  if (name.endsWith('ConnectionError') || name.endsWith('ConnectionTimeoutError')) {
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn(`[auto-connector] transport_error: ${name}`, { message })
    return { status: 'transport_error', staged_diff: null }
  }

  // eslint-disable-next-line no-console -- ops triage signal
  console.warn('[auto-connector] unknown: unclassified Connector error', { name, status, message })
  return { status: 'unknown', staged_diff: null }
}

/**
 * Flatten the per-dimension diff into one `ProposedTimelineEntryDraft[]`
 * the verifier consumes. Each entry's `dimension` is set from the diff key
 * (the agent never emits it as a free-text field — the structural Zod
 * shape pins it).
 */
function flattenDiff(draft: ConnectorDiffDraft): ProposedTimelineEntryDraft[] {
  const out: ProposedTimelineEntryDraft[] = []
  for (const dim of VIPS_DIMENSIONS) {
    const dimDiff = draft.diffs[dim]
    for (const entry of dimDiff.new_timeline_entries) {
      out.push({
        dimension: dim,
        canonical_claim_id: entry.canonical_claim_id,
        verbatim_quote: entry.verbatim_quote,
        reflection_id: entry.reflection_id,
        strength: entry.strength,
        parallax_tag: entry.parallax_tag,
      })
    }
  }
  return out
}

/**
 * Project a stored `VipsTimelineEntryRow` to the verifier's minimal shape.
 * Forgotten rows are already filtered out by `listVipsTimelineEntries`'
 * default (`includeForgotten: false`).
 */
function toVerifierExisting(row: VipsTimelineEntryRow): VerifierExistingTimelineEntry {
  return {
    id: row.id,
    dimension: row.dimension,
    canonical_claim_id: row.canonical_claim_id,
    parallax_tag: row.parallax_tag,
    forgotten_at: row.forgotten_at,
    committed_at: row.committed_at,
  }
}

/**
 * Render a compact one-paragraph summary of a verifier rejection for the
 * `/rejected-diff-patterns.md` memory file. The shape is intentionally
 * structural (`mirror_entry_id`, `dropped[]`, `downgraded[]`) so the agent
 * can pattern-match without parsing prose. Verbatim quotes are truncated to
 * 80 chars to keep the file lean over hundreds of runs.
 */
function summarizeRejection(input: {
  mirrorEntryId: number
  dropped: { entry: ProposedTimelineEntryDraft; reason: string }[]
  downgraded: { canonical_claim_id: string; verbatim_quote: string; dimension: string }[]
}): string {
  const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)
  const droppedLines = input.dropped.map(
    (d) =>
      `- DROP (${d.reason}) ${d.entry.dimension}/${d.entry.canonical_claim_id}: "${truncate(d.entry.verbatim_quote, 80)}"`,
  )
  const downgradedLines = input.downgraded.map(
    (d) =>
      `- DOWNGRADE (partial_match) ${d.dimension}/${d.canonical_claim_id}: "${truncate(d.verbatim_quote, 80)}"`,
  )
  const lines = [`mirror_entry_id=${input.mirrorEntryId}`, ...droppedLines, ...downgradedLines]
  return lines.join('\n')
}

class AutoConnectorTimeoutError extends Error {
  constructor() {
    super('auto-connector exceeded soft timeout')
    this.name = 'AutoConnectorTimeoutError'
  }
}

function raceWithTimeout<T>(p: Promise<T>, ms: number, ac?: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      // Finding #5: abort the underlying SDK request when our soft timeout
      // fires so token spend stops at the network layer, not just inside
      // this wrapper. SDK versions that don't honor `signal` will simply
      // see an ignored abort — behavior is no worse than before.
      ac?.abort()
      reject(new AutoConnectorTimeoutError())
    }, ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/**
 * Managed Agents path (plan §7.1: prompt-as-context). Pre-fetches the
 * inlined taxonomies + top-N FTS-matching past mirrors + VIPS pages via
 * `buildConnectorContext`, then dispatches via `runManagedAgent` which
 * parses the JSON output against `ConnectorDiffSchema`. Returns the parsed
 * object so the caller's `ConnectorDiffSchema.safeParse` is a no-op
 * second-check — keeping a single parse-error code path through the
 * `schema_reject` bucket.
 *
 * `ctx` IS the outer `withStudent` transaction — `buildConnectorContext`
 * reuses it for every internal query so we don't open nested pool
 * checkouts. At `DATABASE_POOL_MAX=5` and ≥5 concurrent Connector runs the
 * previous nested-envelope shape deadlocked the entire pool.
 */
async function runConnectorViaManaged(input: {
  studentId: string
  newReflectionId: number
  ctx: TenantContext
  signal?: AbortSignal
  memoryTransport?: MemoryStoreTransport
}): Promise<unknown> {
  const binding = getManagedAgentBinding('connector')
  const prompt = await buildConnectorContext(input.ctx, input.newReflectionId)
  // Resolve memory store best-effort. Failure here doesn't block Connector;
  // the agent simply runs without `/rejected-diff-patterns.md` carry-over.
  let memoryStoreId: string | null = null
  try {
    memoryStoreId = await getOrCreateMemoryStoreId(input.studentId, input.memoryTransport)
  } catch (err) {
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn('[auto-connector] memory store resolve failed; running without binding', {
      studentId: input.studentId,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    })
  }
  const result = await runManagedAgent({
    agentId: binding.agentId,
    ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
    environmentId: binding.environmentId,
    prompt,
    outputSchema: ConnectorDiffSchema,
    sessionTitle: `connector:${input.studentId}`,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(memoryStoreId !== null ? { memoryStoreId } : {}),
  })
  return result.output
}
