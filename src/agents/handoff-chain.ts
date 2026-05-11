import { run } from '@openai/agents'
import { buildCartographerAgent } from '~/agents/cartographer.ts'
import { buildConnectorAgent } from '~/agents/connector.ts'
import {
  type CartographerOutputDraft,
  CartographerOutputSchema,
  type ConnectorOutputDraft,
  ConnectorOutputSchema,
} from '~/agents/schemas'
import {
  type ConnectorOutputRow,
  insertConnectorOutput,
  insertPathfinderOutput,
  listMirrorEntries,
  type PathfinderOutputRow,
} from '~/db/queries'
import { withStudent } from '~/server/tenancy.server'

export interface RunSenseMakingResult {
  connector: ConnectorOutputRow
  pathfinder: PathfinderOutputRow | null
  partial: boolean
}

export interface RunSenseMakingDeps {
  /** Override Connector invocation. Default: build the agent and call `run`. */
  runConnector?: (input: { studentId: string; corpus: string }) => Promise<ConnectorOutputDraft>
  /** Override Cartographer invocation. Default: build the agent and call `run`. */
  runCartographer?: (input: {
    studentId: string
    connector: ConnectorOutputDraft
  }) => Promise<CartographerOutputDraft>
}

/**
 * Single sense-making pass: Connector → Handoff → Cartographer. Connector reads
 * the whole corpus; Cartographer receives Connector's patterns and returns a
 * trajectory + 2–5 pathways. Both rows are persisted with their traces; the
 * Cartographer row carries `connector_output_id` so the handoff edge is
 * recoverable from the DB.
 *
 * Quiet-mirror pivot: this is the entry point for the manual "Run sense-making"
 * button. The streaming variant lives in `handoff-chain-streamed.ts` (U5).
 *
 * The deps parameter exists so the handoff-chain test can provide
 * predetermined Connector / Cartographer outputs instead of hitting the LLM.
 *
 * v0.2 rename note: this unit (U10) renamed the Pathfinder role to
 * Cartographer. The v0.1 `pathfinder_outputs` table is intentionally kept
 * through the cutover, so the DB row types and persistence helpers retain
 * their `Pathfinder*` names — the rename here is agent-side only.
 */
export async function runSenseMakingForStudent(
  studentId: string,
  deps: RunSenseMakingDeps = {},
): Promise<RunSenseMakingResult> {
  return withStudent(studentId, async (sid) => {
    const corpus = formatCorpusForAgent(sid)

    const connectorDraft =
      deps.runConnector !== undefined
        ? await deps.runConnector({ studentId: sid, corpus })
        : await runConnectorViaSdk({ studentId: sid, corpus })

    const validatedConnector = ConnectorOutputSchema.parse(connectorDraft)
    const connectorRow = insertConnectorOutput(sid, {
      patterns: validatedConnector.patterns,
      still_unclear: validatedConnector.still_unclear,
      trace: { agent: 'connector' },
    })

    let pathfinderRow: PathfinderOutputRow | null = null
    let partial = false
    try {
      const cartographerDraft =
        deps.runCartographer !== undefined
          ? await deps.runCartographer({ studentId: sid, connector: validatedConnector })
          : await runCartographerViaSdk({ studentId: sid, connector: validatedConnector })
      const validatedCartographer = CartographerOutputSchema.parse(cartographerDraft)
      pathfinderRow = insertPathfinderOutput(sid, {
        trajectory: validatedCartographer.trajectory,
        pathways: validatedCartographer.pathways,
        disclaimer: validatedCartographer.disclaimer,
        connector_output_id: connectorRow.id,
        // Trace agent label retains 'pathfinder' for v0.1 DB compatibility —
        // see schema.sql `agent_traces.agent` CHECK widening note. Switching
        // this literal to 'cartographer' is U11's job (or later).
        trace: { agent: 'pathfinder', handoff_from: connectorRow.id },
      })
    } catch (err) {
      // Connector's output is already persisted — the chain reports partial
      // success rather than rolling back what the student can already see.
      partial = true
      console.error('Cartographer failed; partial sense-making persisted', err)
    }

    return { connector: connectorRow, pathfinder: pathfinderRow, partial }
  })
}

/**
 * Format the per-student mirror corpus for Connector / Cartographer. The
 * formatter exposes the three-part Mirror reflection (validation,
 * inferred_meaning, story_reframe) plus the original transcript so agents
 * can ground patterns in either the student's words or Mirror's framing.
 */
export function formatCorpusForAgent(studentId: string): string {
  const entries = listMirrorEntries(studentId, { limit: 200 })
  if (entries.length === 0) return 'No prior reflections.'
  return entries
    .slice()
    .reverse() // chronological order
    .map(
      (e) =>
        `# Reflection #${e.id} — ${e.created_at}

Story (Mirror's reframe):
${e.story_reframe}

Validation (Mirror): ${e.validation}

Inferred meaning (Mirror, candidate): ${e.inferred_meaning}

Transcript (the student's own words):
${e.transcript}`,
    )
    .join('\n\n---\n\n')
}

async function runConnectorViaSdk(input: {
  studentId: string
  corpus: string
}): Promise<ConnectorOutputDraft> {
  // U7 rewrote the Connector agent to emit `ConnectorDiffSchema`, so this
  // legacy path (the manual sense-making chain) can no longer be exercised
  // end-to-end against the real SDK; in practice the chain is only ever
  // invoked with stubs in tests today (`deps.runConnector`), and U11 will
  // delete this path entirely when it cuts over to Cartographer-only sense-
  // making. The double cast keeps the v0.1 type contract intact for the
  // remaining stubbed callers while making the mismatch loud at the call
  // site.
  const agent = buildConnectorAgent({ studentId: input.studentId })
  const result = await run(
    agent,
    `You are reading reflection corpus for student ${input.studentId}. Surface patterns.\n\n${input.corpus}`,
  )
  return result.finalOutput as unknown as ConnectorOutputDraft
}

async function runCartographerViaSdk(input: {
  studentId: string
  connector: ConnectorOutputDraft
}): Promise<CartographerOutputDraft> {
  const agent = buildCartographerAgent({ studentId: input.studentId })
  const handoff = `Connector handed off the following patterns:\n\n${JSON.stringify(input.connector, null, 2)}\n\nProduce trajectory + pathways. Verify Connector's evidence IDs by calling search_past_mirrors when needed.`
  const result = await run(agent, handoff)
  return result.finalOutput as CartographerOutputDraft
}
