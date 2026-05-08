import { run } from '@openai/agents'
import { buildConnectorAgent } from '~/agents/connector.ts'
import { formatCorpusForAgent } from '~/agents/handoff-chain'
import { buildPathfinderAgent } from '~/agents/pathfinder.ts'
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
  type PathfinderOutputDraft,
  PathfinderOutputSchema,
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
  runPathfinder?: (input: {
    studentId: string
    connector: ConnectorOutputDraft
    emit: (e: RunStepEventInput) => void
  }) => Promise<PathfinderOutputDraft>
}

/**
 * Runs Connector → Pathfinder once for a student and captures step-level
 * events from the SDK's streaming run. Caller waits for completion, then
 * the UI replays the events for visualization (U6).
 *
 * The chain is the same as `runSenseMakingForStudent` in `handoff-chain.ts`
 * — Connector reads the corpus, persists, hands off to Pathfinder, which
 * runs and persists. Pathfinder failure produces `partial: true` rather
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
    emit({ type: 'handoff', from: 'connector', to: 'pathfinder' })

    // ── Pathfinder ───────────────────────────────────────────────────────
    emit({ type: 'agent_started', agent: 'pathfinder' })
    let pathfinderRowId: number | null = null
    let partial = false
    try {
      const pathfinderDraft = deps.runPathfinder
        ? await deps.runPathfinder({ studentId: sid, connector: connectorDraft, emit })
        : await runWithStreaming(
            'pathfinder',
            () =>
              run(
                buildPathfinderAgent({ studentId: sid }),
                `Connector handed off the following patterns:\n\n${JSON.stringify(connectorDraft, null, 2)}\n\nProduce trajectory + pathways. Verify Connector's evidence IDs by calling search_past_mirrors when needed.`,
                { stream: true },
              ),
            emit,
          )
      const validated = PathfinderOutputSchema.parse(pathfinderDraft)
      const row = insertPathfinderOutput(sid, {
        trajectory: validated.trajectory,
        pathways: validated.pathways,
        disclaimer: validated.disclaimer,
        connector_output_id: connectorRowId,
        trace: {
          agent: 'pathfinder',
          handoff_from: connectorRowId,
          events_captured: events.length,
        },
      })
      pathfinderRowId = row.id
      emit({
        type: 'agent_completed',
        agent: 'pathfinder',
        outputPreview: truncate(validated.trajectory),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emit({ type: 'error', agent: 'pathfinder', message: msg })
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
 */
function mapSdkEventToStep(
  agent: AgentName,
  ev: unknown,
  emit: (e: RunStepEventInput) => void,
): void {
  if (!ev || typeof ev !== 'object') return
  const evObj = ev as Record<string, unknown>

  // RunItemStreamEvent
  if (evObj.type === 'run_item_stream_event') {
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
        argsPreview: truncate(JSON.stringify(argsObj)),
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
        resultPreview: truncate(typeof output === 'string' ? output : JSON.stringify(output)),
      })
      return
    }
    if (name === 'message_output_created' || itemType === 'message_output_item') {
      // We surface only that a message landed, not its full text — that's the
      // final output, captured separately.
      const text =
        (item.content as Array<{ text?: string }> | undefined)
          ?.map((c) => c.text ?? '')
          .join(' ') ?? ''
      emit({ type: 'message_output', agent, preview: truncate(text) })
      return
    }
    if (name === 'handoff_occurred' || name === 'handoff_requested') {
      // Connector → Pathfinder handoff is emitted by the chain orchestrator,
      // not by the SDK; ignore SDK-internal handoff events.
      return
    }
    if (name === 'reasoning_item_created' || itemType === 'reasoning_item') {
      emit({ type: 'reasoning', agent })
      return
    }
  }
}
