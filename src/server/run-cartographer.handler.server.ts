/**
 * U11 — Manual "Run sense-making" trigger that produces the Trajectory page.
 *
 * The student or operator presses Run sense-making on `/wiki`; this handler:
 *   1. Reads the student's VIPS pages + non-forgotten timeline + corpus
 *      (mirror entries) under `withStudent` (one Postgres transaction).
 *   2. Streams the Cartographer SDK run (single-agent — no handoff) and
 *      maps SDK events to our step-event union via the defensive mapper
 *      from `handoff-chain-streamed.ts`.
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
 *      writes an `agent_traces` row with `agent='cartographer'` (the
 *      CHECK on `agent_traces.agent` was widened in U10 to admit
 *      'cartographer').
 *
 * Scope boundary: the v0.1 `run-sensemaking.*` server fn is intentionally
 * kept as a passthrough through the cutover (per the plan's Scope
 * Boundaries — removal lands in the follow-up PR).
 */
import { run } from '@openai/agents'
import { z } from 'zod'
import { buildCartographerAgent } from '~/agents/cartographer'
import { getManagedAgentBinding, isManagedAgentsEnabled } from '~/agents/config'
import { buildCartographerContext } from '~/agents/context'
import {
  type AgentName,
  type RunStepEvent,
  type RunStepEventInput,
  truncate,
} from '~/agents/run-events'
import { runManagedAgent } from '~/agents/runner'
import {
  type CartographerOutputDraft,
  CartographerOutputSchema,
  type CartographerPathwayDraft,
} from '~/agents/schemas'
import { ECG_TAXONOMY } from '~/data/ecg-taxonomy'
import { VIPS_DIMENSIONS } from '~/data/vips-taxonomy'
import { type TenantContext, withStudent } from '~/db/client'
import {
  insertCartographerOutput,
  listMirrorEntries,
  listVipsPages,
  listVipsTimelineEntries,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'

export const runCartographerInputSchema = z.object({
  studentId: z.string().min(1),
})
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
   * Test seam: bypass the SDK and return a pre-baked Cartographer draft.
   * Tests stub this to exercise the post-process validator without touching
   * the LLM. The stub can also emit step events via the supplied emitter,
   * which keeps the event-order assertions reachable from tests.
   */
  runCartographer?: (input: {
    studentId: string
    pages: VipsPageRow[]
    timeline: VipsTimelineEntryRow[]
    corpus: string
    emit: (e: RunStepEventInput) => void
  }) => Promise<unknown>
}

/** Pre-computed set of valid `cluster.*` IDs from the ECG taxonomy fixture. */
const VALID_CLUSTER_IDS: ReadonlySet<string> = new Set(
  ECG_TAXONOMY.filter((e) => e.category === 'cluster').map((e) => e.id),
)

export async function runCartographerHandler(
  data: RunCartographerInput,
  deps: RunCartographerDeps = {},
): Promise<RunCartographerResult> {
  const parsed = runCartographerInputSchema.parse(data)
  const start = Date.now()
  const events: RunStepEvent[] = []
  const emit = (e: RunStepEventInput) => {
    events.push({ ...e, timestampMs: Date.now() - start } as RunStepEvent)
  }

  return withStudent(parsed.studentId, async (ctx) => {
    // ── Read context ───────────────────────────────────────────────────────
    const pages = await listVipsPages(parsed.studentId, { ctx })
    const timelineByDim = await Promise.all(
      VIPS_DIMENSIONS.map((dim) =>
        listVipsTimelineEntries(parsed.studentId, dim, { includeForgotten: false, ctx }),
      ),
    )
    const timeline: VipsTimelineEntryRow[] = timelineByDim.flat()
    const corpus = await formatCorpusForCartographer(parsed.studentId, ctx)

    // ── Invoke Cartographer (real SDK / managed / stub) ────────────────────
    // Routing precedence mirrors `runAutoConnectorAfterMirror`:
    //   1. `deps.runCartographer` (test injection — wins over both runtimes).
    //   2. `USE_MANAGED_AGENTS=true` → Anthropic Managed Agents path.
    //   3. Default → OpenAI Agents SDK via the v0.1 streaming path.
    emit({ type: 'agent_started', agent: 'cartographer' })
    let rawDraft: unknown
    try {
      rawDraft = deps.runCartographer
        ? await deps.runCartographer({ studentId: parsed.studentId, pages, timeline, corpus, emit })
        : isManagedAgentsEnabled()
          ? await runCartographerViaManaged({ studentId: parsed.studentId, ctx })
          : await runCartographerViaSdkStreamed(
              { studentId: parsed.studentId, pages, timeline, corpus },
              emit,
            )
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
      parsed.studentId,
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
 * Format the Cartographer prompt context. Includes the four VIPS pages'
 * current state with their non-forgotten timeline entries, plus a short
 * corpus summary so the agent can ground claims that aren't yet on a
 * timeline entry.
 */
export function formatCartographerPromptContext(input: {
  studentId: string
  pages: VipsPageRow[]
  timeline: VipsTimelineEntryRow[]
  corpus: string
}): string {
  const { studentId, pages, timeline, corpus } = input
  const pagesBlock = VIPS_DIMENSIONS.map((dim) => {
    const page = pages.find((p) => p.dimension === dim)
    const entriesForDim = timeline.filter((e) => e.dimension === dim)
    return [
      `## ${dim.toUpperCase()}`,
      page
        ? `Compiled truth: ${page.compiled_truth}\nOpen question: ${page.open_question}`
        : 'Compiled truth: (empty)\nOpen question: (empty)',
      entriesForDim.length === 0
        ? 'Timeline entries: (none)'
        : `Timeline entries:\n${entriesForDim
            .map(
              (e) =>
                `- id=${e.id} [${e.canonical_claim_id}] (${e.strength}, parallax=${JSON.stringify(e.parallax_tag)}) "${e.verbatim_quote}"`,
            )
            .join('\n')}`,
    ].join('\n')
  }).join('\n\n')

  return `# Trajectory pass for student ${studentId}

# Current VIPS pages

${pagesBlock}

# Mirror corpus (background)

${corpus}

Produce a CartographerOutputSchema-shaped Trajectory page. trait_combination claim_ids must appear on a current timeline entry above; ecg_region_tags must be cluster-level IDs from lookup_ecg_taxonomy.`
}

/**
 * Stream the SDK Cartographer run, mapping events through the same
 * defensive mapper that `handoff-chain-streamed.ts` uses. The single-agent
 * surface means no handoff events; the SDK's handoff events are filtered
 * out for v0.1 compat but should not fire here in practice.
 */
async function runCartographerViaSdkStreamed(
  input: {
    studentId: string
    pages: VipsPageRow[]
    timeline: VipsTimelineEntryRow[]
    corpus: string
  },
  emit: (e: RunStepEventInput) => void,
): Promise<unknown> {
  const prompt = formatCartographerPromptContext(input)
  const stream = await run(buildCartographerAgent({ studentId: input.studentId }), prompt, {
    stream: true,
  })
  for await (const ev of stream) {
    mapSdkEventToStep('cartographer', ev, emit)
  }
  // biome-ignore lint/suspicious/noExplicitAny: SDK stream return shape.
  return (stream as any).finalOutput
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
 * and the Anthropic SDK does not (yet — see plan §14.9) expose a
 * Last-Event-ID cursor for client-side reconnect. The 800s overrun case is
 * the sweep cron's job (plan §8.2, Step 8).
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
}): Promise<unknown> {
  const binding = getManagedAgentBinding('cartographer')
  // Reuse the outer `withStudent` transaction's pool checkout — nested
  // envelopes deadlock the pool at DATABASE_POOL_MAX=5 with >=5 concurrent
  // Cartographer runs.
  const prompt = await buildCartographerContext(input.ctx)
  const result = await runManagedAgent({
    agentId: binding.agentId,
    ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
    environmentId: binding.environmentId,
    prompt,
    outputSchema: CartographerOutputSchema,
    sessionTitle: `cartographer:${input.studentId}`,
    timeoutMs: 780_000,
  })
  return result.output
}

/**
 * Mirror of `handoff-chain-streamed.ts`'s defensive event mapper. We
 * intentionally inline it here rather than importing the legacy chain's
 * private helper — the legacy chain is slated for deletion per the plan's
 * Scope Boundaries, and the U11 cut-over keeps Cartographer self-contained.
 * Logic is byte-equivalent to commit 71b0510's hardened mapper at
 * lines 190-260 of `handoff-chain-streamed.ts`.
 *
 * TODO(v0.3-cutover): consolidate with the canonical mapper in
 * `src/agents/handoff-chain-streamed.ts` once `run-sensemaking.handler.server.ts`
 * is deleted — until then the legacy chain still references it.
 */
function mapSdkEventToStep(
  agent: AgentName,
  ev: unknown,
  emit: (e: RunStepEventInput) => void,
): void {
  try {
    if (!ev || typeof ev !== 'object') return
    const evObj = ev as Record<string, unknown>
    if (evObj.type !== 'run_item_stream_event') return

    const name = evObj.name as string | undefined
    const item = (evObj.item ?? {}) as Record<string, unknown>
    const itemType = (item.type as string | undefined) ?? ''

    if (name === 'tool_called' || itemType === 'tool_call_item') {
      const toolName =
        (item.rawItem as Record<string, unknown> | undefined)?.name?.toString() ??
        (item.tool_name as string | undefined) ??
        'tool'
      const argsObj =
        (item.rawItem as Record<string, unknown> | undefined)?.arguments ??
        (item.arguments as unknown) ??
        {}
      emit({
        type: 'tool_call_started',
        agent,
        toolName,
        argsPreview: truncate(safeStringify(argsObj)),
      })
      return
    }
    if (name === 'tool_output' || itemType === 'tool_call_output_item') {
      const toolName =
        (item.rawItem as Record<string, unknown> | undefined)?.name?.toString() ?? 'tool'
      const output =
        (item.output as unknown) ??
        (item.rawItem as Record<string, unknown> | undefined)?.output ??
        ''
      emit({
        type: 'tool_call_completed',
        agent,
        toolName,
        resultPreview: truncate(typeof output === 'string' ? output : safeStringify(output)),
      })
      return
    }
    if (name === 'message_output_created' || itemType === 'message_output_item') {
      emit({ type: 'message_output', agent, preview: truncate(extractMessageText(item)) })
      return
    }
    if (name === 'handoff_occurred' || name === 'handoff_requested') {
      // Single-agent chain — no handoff is expected. Ignored for safety.
      return
    }
    if (name === 'reasoning_item_created' || itemType === 'reasoning_item') {
      emit({ type: 'reasoning', agent })
      return
    }
  } catch (err) {
    console.warn(
      '[run-cartographer mapSdkEventToStep] mapping skipped:',
      err instanceof Error ? err.message : err,
    )
  }
}

function extractMessageText(item: Record<string, unknown>): string {
  const content = item.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object' && 'text' in c) {
          const t = (c as { text?: unknown }).text
          return typeof t === 'string' ? t : ''
        }
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  if (content && typeof content === 'object' && 'text' in content) {
    const t = (content as { text?: unknown }).text
    if (typeof t === 'string') return t
  }
  const top = item.text
  if (typeof top === 'string') return top
  return ''
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Background context for the agent — the non-forgotten Mirror corpus,
 * lightly formatted. Cartographer reads the four VIPS pages as primary
 * context; the corpus is supporting evidence the agent can quote from
 * via `search_past_mirrors` if needed.
 */
async function formatCorpusForCartographer(studentId: string, ctx: TenantContext): Promise<string> {
  const entries = await listMirrorEntries(studentId, { limit: 200, ctx })
  if (entries.length === 0) return 'No prior reflections.'
  return entries
    .slice()
    .reverse()
    .map(
      (e) =>
        `# Reflection #${e.id} — ${e.created_at} (context=${e.context_type})

Story (Mirror reframe):
${e.story_reframe}

Transcript (student's own words):
${e.transcript}`,
    )
    .join('\n\n---\n\n')
}
