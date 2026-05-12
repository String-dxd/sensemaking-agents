/**
 * U11 — Manual "Run sense-making" trigger that produces the Trajectory page.
 *
 * The student or operator presses Run sense-making on `/wiki`; this handler:
 *   1. Reads the student's VIPS pages + non-forgotten timeline under
 *      `withStudent` (one Postgres transaction).
 *   2. Dispatches the Cartographer run via Anthropic Managed Agents
 *      (`runManagedAgent`).
 *   3. Hard-fails on `CartographerOutputSchema.safeParse` rejection — no
 *      row is written, the response carries `ok: false`.
 *   4. Runs the post-process structural validator (R17): each pathway's
 *      `trait_combination[].claim_id` must exist on a non-forgotten
 *      timeline entry for this student, and each `ecg_region_tags[]` value
 *      must be a valid `cluster.*` ID in `src/data/ecg-taxonomy.ts`.
 *      Offending pathways are dropped and warnings recorded. If fewer than
 *      two valid pathways remain, the run reports `no_valid_pathways` and
 *      no row is written.
 *   5. Persists the validated payload via `insertCartographerOutput` AND
 *      writes an `agent_traces` row with `agent='cartographer'`.
 */
import { z } from 'zod'
import { getManagedAgentBinding } from '~/agents/config'
import { buildCartographerContext } from '~/agents/context'
import {
  appendIfNovel,
  appendStudentMemory,
  getOrCreateMemoryStoreId,
  MEMORY_FILE_PATHS,
  type MemoryStoreTransport,
  MemoryWriteError,
} from '~/agents/memory'
import { type RunStepEvent, type RunStepEventInput, truncate } from '~/agents/run-events'
import { runManagedAgent } from '~/agents/runner'
import {
  type CartographerOutputDraft,
  CartographerOutputSchema,
  type CartographerPathwayDraft,
} from '~/agents/schemas'
import { requireCounselorContext } from '~/auth/identity'
import { ECG_TAXONOMY } from '~/data/ecg-taxonomy'
import { VIPS_DIMENSIONS } from '~/data/vips-taxonomy'
import { type TenantContext, withStudent } from '~/db/client'
import {
  insertCartographerOutput,
  listVipsPages,
  listVipsTimelineEntries,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'

export const runCartographerInputSchema = z.object({})
export type RunCartographerInput = z.output<typeof runCartographerInputSchema>

export type RunCartographerStatus = 'ok' | 'schema_reject' | 'no_valid_pathways' | 'agent_error'

/**
 * The validated Trajectory payload returned on `ok: true`. Mirrors the
 * persisted `cartographer_outputs` row shape (minus storage metadata),
 * scoped to what `/wiki/trajectory` needs.
 */
export interface TrajectoryResponse {
  trajectory_paragraph: string
  pathways: CartographerPathwayDraft[]
  open_questions: string[]
  disclaimer: string
}

export interface RunCartographerOkResult {
  ok: true
  status: 'ok'
  cartographer_output_id: number
  trajectory: TrajectoryResponse
  events: RunStepEvent[]
  totalDurationMs: number
  /** Non-fatal post-process drops (invalid claim IDs, invalid ECG tags). */
  warnings: string[]
}

export interface RunCartographerErrorResult {
  ok: false
  status: Exclude<RunCartographerStatus, 'ok'>
  error: string
  events: RunStepEvent[]
  totalDurationMs: number
  /** Always present; populated for `no_valid_pathways` so callers see why each
   *  pathway was dropped. Empty array for schema_reject / agent_error. */
  warnings: string[]
}

export type RunCartographerResult = RunCartographerOkResult | RunCartographerErrorResult

export interface RunCartographerDeps {
  /**
   * Test seam: bypass the runner and return a pre-baked Cartographer draft.
   * Tests stub this to exercise the post-process validator without touching
   * the LLM. The stub can also emit step events via the supplied emitter,
   * which keeps the event-order assertions reachable from tests.
   */
  runCartographer?: (input: {
    studentId: string
    pages: VipsPageRow[]
    timeline: VipsTimelineEntryRow[]
    emit: (e: RunStepEventInput) => void
  }) => Promise<unknown>
  /** Override the Anthropic memory-store transport for post-run memory writes. */
  memoryTransport?: MemoryStoreTransport
}

/** Pre-computed set of valid `cluster.*` IDs from the ECG taxonomy fixture. */
const VALID_CLUSTER_IDS: ReadonlySet<string> = new Set(
  ECG_TAXONOMY.filter((e) => e.category === 'cluster').map((e) => e.id),
)

export async function runCartographerHandler(
  data: RunCartographerInput,
  deps: RunCartographerDeps = {},
): Promise<RunCartographerResult> {
  runCartographerInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  const start = Date.now()
  const events: RunStepEvent[] = []
  const emit = (e: RunStepEventInput) => {
    events.push({ ...e, timestampMs: Date.now() - start } as RunStepEvent)
  }

  return withStudent(studentId, async (ctx) => {
    // ── Read context ───────────────────────────────────────────────────────
    const pages = await listVipsPages(studentId, { ctx })
    const timelineByDim = await Promise.all(
      VIPS_DIMENSIONS.map((dim) =>
        listVipsTimelineEntries(studentId, dim, { includeForgotten: false, ctx }),
      ),
    )
    const timeline: VipsTimelineEntryRow[] = timelineByDim.flat()

    // ── Invoke Cartographer (managed runner or test stub) ──────────────────
    emit({ type: 'agent_started', agent: 'cartographer' })
    let rawDraft: unknown
    try {
      rawDraft = deps.runCartographer
        ? await deps.runCartographer({ studentId: studentId, pages, timeline, emit })
        : await runCartographerViaManaged({
            studentId: studentId,
            ctx,
            ...(deps.memoryTransport ? { memoryTransport: deps.memoryTransport } : {}),
          })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emit({ type: 'error', agent: 'cartographer', message: msg })
      emit({
        type: 'run_completed',
        connectorOutputId: -1,
        pathfinderOutputId: null,
        partial: true,
      })
      return {
        ok: false as const,
        status: 'agent_error' as const,
        error: msg,
        events,
        totalDurationMs: Date.now() - start,
        warnings: [],
      }
    }

    // ── Hard-fail schema validation ────────────────────────────────────────
    const validated = CartographerOutputSchema.safeParse(rawDraft)
    if (!validated.success) {
      const errMsg = `schema_reject: ${validated.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
      emit({ type: 'error', agent: 'cartographer', message: errMsg })
      emit({
        type: 'run_completed',
        connectorOutputId: -1,
        pathfinderOutputId: null,
        partial: true,
      })
      return {
        ok: false as const,
        status: 'schema_reject' as const,
        error: errMsg,
        events,
        totalDurationMs: Date.now() - start,
        warnings: [],
      }
    }
    const draft: CartographerOutputDraft = validated.data

    // ── Post-process structural validator ──────────────────────────────────
    const validClaimIds: ReadonlySet<string> = new Set(timeline.map((e) => e.canonical_claim_id))
    const warnings: string[] = []
    const keptPathways: CartographerPathwayDraft[] = []

    for (const [idx, pathway] of draft.pathways.entries()) {
      // Schema now admits empty arrays for trait_combination + ecg_region_tags
      // (Managed Agents output is structurally legal but sometimes incomplete).
      // We treat empty as "no anchor" and drop with a warning so the reviewer
      // sees the agent failed to cite anchors rather than a hard parse fail.
      if (pathway.trait_combination.length === 0) {
        warnings.push(
          `pathway[${idx}] "${pathway.label}" dropped: trait_combination is empty`,
        )
        continue
      }
      if (pathway.ecg_region_tags.length === 0) {
        warnings.push(
          `pathway[${idx}] "${pathway.label}" dropped: ecg_region_tags is empty`,
        )
        continue
      }
      const badClaim = pathway.trait_combination.find((c) => !validClaimIds.has(c.claim_id))
      if (badClaim) {
        warnings.push(
          `pathway[${idx}] "${pathway.label}" dropped: trait_combination cites unknown claim_id "${badClaim.claim_id}"`,
        )
        continue
      }
      const badTag = pathway.ecg_region_tags.find((t) => !VALID_CLUSTER_IDS.has(t))
      if (badTag) {
        warnings.push(
          `pathway[${idx}] "${pathway.label}" dropped: ecg_region_tags references unknown cluster "${badTag}"`,
        )
        continue
      }
      keptPathways.push(pathway)
    }

    if (keptPathways.length < 2) {
      const errMsg = `no_valid_pathways: ${keptPathways.length} pathway(s) survived post-process validation (need >= 2)`
      emit({ type: 'error', agent: 'cartographer', message: errMsg })
      emit({
        type: 'run_completed',
        connectorOutputId: -1,
        pathfinderOutputId: null,
        partial: true,
      })
      return {
        ok: false as const,
        status: 'no_valid_pathways' as const,
        error: errMsg,
        events,
        totalDurationMs: Date.now() - start,
        warnings,
      }
    }

    // ── Persist ────────────────────────────────────────────────────────────
    // `cartographer_outputs.pathways_json` stores the v0.2 lead-sheet shape;
    // the DB row type's `CartographerPathway` now matches that shape
    // exactly (Finding #8), so we pass `keptPathways` directly.
    const row = await insertCartographerOutput(
      studentId,
      {
        trajectory_text: draft.trajectory_paragraph,
        pathways: keptPathways,
        open_questions: draft.open_questions,
        disclaimer: draft.disclaimer,
        raw_output: {
          trajectory_paragraph: draft.trajectory_paragraph,
          pathways: keptPathways,
          open_questions: draft.open_questions,
          disclaimer: draft.disclaimer,
          warnings,
        },
        // U1's helper was updated by U11 to write the `agent_traces` row with
        // `agent='cartographer'` when a trace is supplied. The widened CHECK
        // from U10 makes this row legal at the schema level.
        trace: {
          totalDurationMs: Date.now() - start,
          warnings,
          pathways_in: draft.pathways.length,
          pathways_out: keptPathways.length,
          event_count: events.length,
        },
      },
      { ctx },
    )

    emit({
      type: 'agent_completed',
      agent: 'cartographer',
      outputPreview: truncate(draft.trajectory_paragraph),
    })
    emit({
      type: 'run_completed',
      connectorOutputId: -1,
      pathfinderOutputId: row.id,
      partial: false,
    })

    // ── Cartographer memory appends (best-effort, non-blocking) ──
    // Pedagogical state: snapshot the trajectory paragraph + open questions
    // (compact form). Exploratory threads: snapshot each pathway's
    // `exploration_prompt`. Both files accumulate across runs so the agent
    // can read its own prior framings on the next session.
    //
    // Cartographer outputs are long-form synthesis — failure to mirror them
    // into memory must NEVER unwind the persisted row, so each append is
    // independently caught.
    const pedagogicalSummary = formatPedagogicalState(draft, row.id)
    const exploratorySummary = formatExploratoryThreads(keptPathways, row.id)
    await Promise.all([
      appendMemoryBestEffort(
        studentId,
        MEMORY_FILE_PATHS.pedagogicalState,
        pedagogicalSummary,
        `cartographer#${row.id}/pedagogical`,
        deps.memoryTransport,
      ),
      appendMemoryBestEffort(
        studentId,
        MEMORY_FILE_PATHS.exploratoryThreads,
        exploratorySummary,
        `cartographer#${row.id}/exploratory`,
        deps.memoryTransport,
      ),
    ])

    return {
      ok: true as const,
      status: 'ok' as const,
      cartographer_output_id: row.id,
      trajectory: {
        trajectory_paragraph: draft.trajectory_paragraph,
        pathways: keptPathways,
        open_questions: draft.open_questions,
        disclaimer: draft.disclaimer,
      },
      events,
      totalDurationMs: Date.now() - start,
      warnings,
    }
  })
}

/**
 * Managed Agents path (plan §7.1: prompt-as-context, §8.3: long-running
 * synthesis). `buildCartographerContext` pre-fetches the inlined taxonomies
 * + the four VIPS pages + non-forgotten timeline + the FTS slice keyed by
 * each VIPS page's `open_question`. `runManagedAgent` consumes the session
 * event stream internally and returns the parsed `CartographerOutputSchema`
 * payload.
 *
 * No intermediate step-events are emitted on this path. The current route
 * (`run-cartographer.functions.ts`) is a regular `createServerFn` POST that
 * accumulates events into the response — there is no SSE pipe to a browser,
 * and the Anthropic SDK does not yet expose a Last-Event-ID cursor for
 * client-side reconnect. The 800s overrun case is the sweep cron's job.
 *
 * Caller MUST be inside `withStudent(studentId, ...)`.
 *
 * Timeout: Cartographer is the longest-running agent in the v0.2 surface
 * (plan §10 sets `maxDuration=800` on this route). The 120s default in
 * `runManagedAgent` is for one-shot Mirror/Connector calls; we bump it to
 * the route's wall-clock budget here so the runner does not give up before
 * the platform does.
 */
async function runCartographerViaManaged(input: {
  studentId: string
  ctx: TenantContext
  memoryTransport?: MemoryStoreTransport
}): Promise<unknown> {
  const binding = getManagedAgentBinding('cartographer')
  // Reuse the outer `withStudent` transaction's pool checkout — nested
  // envelopes deadlock the pool at DATABASE_POOL_MAX=5 with >=5 concurrent
  // Cartographer runs.
  const prompt = await buildCartographerContext(input.ctx)
  // Memory store binding is best-effort — Cartographer's prompt already
  // carries the full VIPS state, so missing `/pedagogical-state.md` carry-over
  // degrades quality but does not break the run.
  let memoryStoreId: string | null = null
  try {
    memoryStoreId = await getOrCreateMemoryStoreId(input.studentId, input.memoryTransport)
  } catch (err) {
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn('[run-cartographer] memory store resolve failed; running without binding', {
      studentId: input.studentId,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    })
  }
  const result = await runManagedAgent({
    agentId: binding.agentId,
    ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
    environmentId: binding.environmentId,
    prompt,
    outputSchema: CartographerOutputSchema,
    sessionTitle: `cartographer:${input.studentId}`,
    timeoutMs: 780_000,
    ...(memoryStoreId !== null ? { memoryStoreId } : {}),
  })
  return result.output
}

/**
 * `/pedagogical-state.md` payload — the trajectory paragraph plus open
 * questions, tagged with the persisted output id so the agent can correlate
 * against `cartographer_outputs` if it needs to dig deeper next session.
 */
function formatPedagogicalState(
  draft: CartographerOutputDraft,
  cartographerOutputId: number,
): string {
  const lines = [
    `cartographer_output_id=${cartographerOutputId}`,
    '',
    'Trajectory:',
    draft.trajectory_paragraph,
  ]
  if (draft.open_questions.length > 0) {
    lines.push('', 'Open questions:')
    for (const q of draft.open_questions) lines.push(`- ${q}`)
  }
  return lines.join('\n')
}

/**
 * `/exploratory-threads.md` payload — one bullet per kept pathway with the
 * exploration prompt and its trait combination, so the agent can build on
 * (or deliberately diverge from) prior threads.
 */
function formatExploratoryThreads(
  pathways: CartographerPathwayDraft[],
  cartographerOutputId: number,
): string {
  const lines = [`cartographer_output_id=${cartographerOutputId}`]
  for (const p of pathways) {
    const claims = p.trait_combination.map((t) => t.claim_id).join(', ')
    lines.push('', `- ${p.label} [${claims}]`, `  ${p.exploration_prompt}`)
  }
  return lines.join('\n')
}

/**
 * Append to a memory file, swallowing all errors except `DIAGNOSTIC_LANGUAGE`
 * (which is logged but still not propagated — the Cartographer row has
 * already been persisted and the user is waiting on the response).
 */
async function appendMemoryBestEffort(
  studentId: string,
  filePath: (typeof MEMORY_FILE_PATHS)[keyof typeof MEMORY_FILE_PATHS],
  content: string,
  source: string,
  transport: MemoryStoreTransport | undefined,
): Promise<void> {
  try {
    await appendStudentMemory(studentId, filePath, appendIfNovel(content, { source }), transport)
  } catch (err) {
    const tag =
      err instanceof MemoryWriteError && err.code === 'DIAGNOSTIC_LANGUAGE'
        ? 'diagnostic-language gate'
        : 'transport error'
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn(`[run-cartographer] ${filePath} append failed (${tag}); continuing`, {
      studentId,
      source,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    })
  }
}
