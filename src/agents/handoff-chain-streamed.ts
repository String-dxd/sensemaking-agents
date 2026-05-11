import { run } from '@openai/agents'
import { buildCartographerAgent } from '~/agents/cartographer.ts'
import { buildConnectorAgent } from '~/agents/connector.ts'
import { formatCorpusForAgent } from '~/agents/handoff-chain'
import {
  type AgentName,
  type RunSensemakingResult,
  type RunStepEvent,
  type RunStepEventInput,
  truncate,
} from '~/agents/run-events'
import {
  type ConnectorOutputDraft,
  ConnectorOutputSchema,
  type LegacyPathfinderOutputDraft,
  LegacyPathfinderOutputSchema,
} from '~/agents/schemas'
import { insertConnectorOutput, insertPathfinderOutput } from '~/db/queries'
import { withStudent } from '~/server/tenancy.server'

export interface RunSensemakingStreamedDeps {
  /**
   * Override Connector run with a stub. The stub must yield events in
   * insertion order and return the parsed Connector output. Tests use
   * this to bypass the LLM.
   */
  runConnector?: (input: {
    studentId: string
    corpus: string
    emit: (e: RunStepEventInput) => void
  }) => Promise<ConnectorOutputDraft>
  /** v0.1 legacy shape — see `handoff-chain.ts` for rationale. The streamed
   *  variant of the passthrough chain emits the same `{trajectory, pathways,
   *  disclaimer}` payload so `insertPathfinderOutput` can write it. */
  runCartographer?: (input: {
    studentId: string
    connector: ConnectorOutputDraft
    emit: (e: RunStepEventInput) => void
  }) => Promise<LegacyPathfinderOutputDraft>
}

/**
 * Runs Connector → Cartographer once for a student and captures step-level
 * events from the SDK's streaming run. Caller waits for completion, then
 * the UI replays the events for visualization (U6).
 *
 * The chain is the same as `runSenseMakingForStudent` in `handoff-chain.ts`
 * — Connector reads the corpus, persists, hands off to Cartographer, which
 * runs and persists. Cartographer failure produces `partial: true` rather
 * than rolling back Connector.
 */
export async function runSensemakingStreamed(
  studentId: string,
  deps: RunSensemakingStreamedDeps = {},
): Promise<RunSensemakingResult> {
  const start = Date.now()
  const events: RunStepEvent[] = []
  const emit = (e: RunStepEventInput) => {
    events.push({ ...e, timestampMs: Date.now() - start } as RunStepEvent)
  }

  return withStudent(studentId, async (sid) => {
    const corpus = formatCorpusForAgent(sid)

    // ── Connector ────────────────────────────────────────────────────────
    emit({ type: 'agent_started', agent: 'connector' })
    let connectorDraft: ConnectorOutputDraft
    let connectorRowId: number | null = null
    try {
      connectorDraft = deps.runConnector
        ? await deps.runConnector({ studentId: sid, corpus, emit })
        : await runWithStreaming(
            'connector',
            () =>
              run(
                buildConnectorAgent({ studentId: sid }),
                `You are reading reflection corpus for student ${sid}. Surface patterns.\n\n${corpus}`,
                { stream: true },
              ),
            emit,
          )
      const validated = ConnectorOutputSchema.parse(connectorDraft)
      const row = insertConnectorOutput(sid, {
        patterns: validated.patterns,
        still_unclear: validated.still_unclear,
        trace: { agent: 'connector', events_captured: events.length },
      })
      connectorRowId = row.id
      emit({
        type: 'agent_completed',
        agent: 'connector',
        outputPreview: truncate(JSON.stringify(validated.patterns.slice(0, 1))),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emit({ type: 'error', agent: 'connector', message: msg })
      const totalDurationMs = Date.now() - start
      return {
        events,
        totalDurationMs,
        connectorOutputId: null,
        pathfinderOutputId: null,
        partial: true,
      }
    }

    // ── Handoff ──────────────────────────────────────────────────────────
    emit({ type: 'handoff', from: 'connector', to: 'cartographer' })

    // ── Cartographer ─────────────────────────────────────────────────────
    emit({ type: 'agent_started', agent: 'cartographer' })
    let pathfinderRowId: number | null = null
    let partial = false
    try {
      const cartographerDraft = deps.runCartographer
        ? await deps.runCartographer({ studentId: sid, connector: connectorDraft, emit })
        : await runWithStreaming(
            'cartographer',
            () =>
              run(
                buildCartographerAgent({ studentId: sid }),
                `Connector handed off the following patterns:\n\n${JSON.stringify(connectorDraft, null, 2)}\n\nProduce trajectory + pathways. Verify Connector's evidence IDs by calling search_past_mirrors when needed.`,
                { stream: true },
              ),
            emit,
          )
      const validated = LegacyPathfinderOutputSchema.parse(cartographerDraft)
      const row = insertPathfinderOutput(sid, {
        trajectory: validated.trajectory,
        pathways: validated.pathways,
        disclaimer: validated.disclaimer,
        connector_output_id: connectorRowId,
        // Trace agent label retains 'pathfinder' for v0.1 DB compatibility —
        // see schema.sql `agent_traces.agent` CHECK widening note.
        trace: {
          agent: 'pathfinder',
          handoff_from: connectorRowId,
          events_captured: events.length,
        },
      })
      pathfinderRowId = row.id
      emit({
        type: 'agent_completed',
        agent: 'cartographer',
        outputPreview: truncate(validated.trajectory),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emit({ type: 'error', agent: 'cartographer', message: msg })
      partial = true
    }

    emit({
      type: 'run_completed',
      connectorOutputId: connectorRowId ?? -1,
      pathfinderOutputId: pathfinderRowId,
      partial,
    })

    const totalDurationMs = Date.now() - start
    return {
      events,
      totalDurationMs,
      connectorOutputId: connectorRowId,
      pathfinderOutputId: pathfinderRowId,
      partial,
    }
  })
}

/**
 * Iterate the SDK's StreamedRunResult, mapping its events to our
 * UI step-event union. Returns the parsed final output.
 */
async function runWithStreaming<T>(
  agent: AgentName,
  startStream: () => Promise<{
    [Symbol.asyncIterator]: () => AsyncIterator<unknown>
    finalOutput: unknown
  }>,
  emit: (e: RunStepEventInput) => void,
): Promise<T> {
  const stream = await startStream()
  for await (const ev of stream) {
    mapSdkEventToStep(agent, ev, emit)
  }
  return stream.finalOutput as T
}

/**
 * Best-effort mapping of `RunStreamEvent` shapes from
 * `@openai/agents` to our step-event union. Different SDK versions emit
 * slightly different fields; we read defensively.
 *
 * TODO(v0.3-cutover): this is the canonical mapper. `run-cartographer.handler.server.ts`
 * inlines a byte-equivalent copy; consolidate into a shared module once
 * `run-sensemaking.handler.server.ts` (the legacy chain entry point) is deleted.
 */
function mapSdkEventToStep(
  agent: AgentName,
  ev: unknown,
  emit: (e: RunStepEventInput) => void,
): void {
  // Wrap the entire mapper in try/catch — different SDK versions emit
  // slightly different shapes, and a single mapping failure must never
  // abort the run-stream iterator.
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
      // The SDK has historically used several shapes for message content:
      // string, Array<{text}>, {text}, etc. We surface only that a message
      // landed plus a short preview — the full output is captured at
      // agent_completed time.
      emit({ type: 'message_output', agent, preview: truncate(extractMessageText(item)) })
      return
    }
    if (name === 'handoff_occurred' || name === 'handoff_requested') {
      // Connector → Cartographer handoff is emitted by the chain orchestrator,
      // not by the SDK; ignore SDK-internal handoff events.
      return
    }
    if (name === 'reasoning_item_created' || itemType === 'reasoning_item') {
      emit({ type: 'reasoning', agent })
      return
    }
  } catch (err) {
    // Single event mapping failure — do not abort the run.
    console.warn('[mapSdkEventToStep] mapping skipped:', err instanceof Error ? err.message : err)
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
  // Fall back to top-level `text` field that some SDK versions use.
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
