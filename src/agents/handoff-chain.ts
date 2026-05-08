import { run } from '@openai/agents'
import { buildConnectorAgent } from '~/agents/connector.ts'
import { buildPathfinderAgent } from '~/agents/pathfinder.ts'
import {
  type ConnectorOutputDraft,
  ConnectorOutputSchema,
  type PathfinderOutputDraft,
  PathfinderOutputSchema,
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
  /** Override Pathfinder invocation. Default: build the agent and call `run`. */
  runPathfinder?: (input: {
    studentId: string
    connector: ConnectorOutputDraft
  }) => Promise<PathfinderOutputDraft>
}

/**
 * Single cron pass: Connector → Handoff → Pathfinder. Connector reads the
 * whole corpus; Pathfinder receives Connector's patterns and returns a
 * trajectory + 2–5 pathways. Both rows are persisted with their traces; the
 * Pathfinder row carries `connector_output_id` so the handoff edge is
 * recoverable from the DB.
 *
 * The deps parameter exists so the handoff-chain test can provide
 * predetermined Connector / Pathfinder outputs instead of hitting the LLM.
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
      const pathfinderDraft =
        deps.runPathfinder !== undefined
          ? await deps.runPathfinder({ studentId: sid, connector: validatedConnector })
          : await runPathfinderViaSdk({ studentId: sid, connector: validatedConnector })
      const validatedPathfinder = PathfinderOutputSchema.parse(pathfinderDraft)
      pathfinderRow = insertPathfinderOutput(sid, {
        trajectory: validatedPathfinder.trajectory,
        pathways: validatedPathfinder.pathways,
        disclaimer: validatedPathfinder.disclaimer,
        connector_output_id: connectorRow.id,
        trace: { agent: 'pathfinder', handoff_from: connectorRow.id },
      })
    } catch (err) {
      // Connector's output is already persisted — the chain reports partial
      // success rather than rolling back what the student can already see.
      partial = true
      // biome-ignore lint/suspicious/noConsole: surfaced for cron logs
      console.error('Pathfinder failed; partial sense-making persisted', err)
    }

    return { connector: connectorRow, pathfinder: pathfinderRow, partial }
  })
}

function formatCorpusForAgent(studentId: string): string {
  const entries = listMirrorEntries(studentId, { limit: 200 })
  if (entries.length === 0) return 'No prior reflections.'
  return entries
    .slice()
    .reverse() // chronological order
    .map(
      (e) =>
        `# Reflection #${e.id} — ${e.created_at}\n${e.summary}\n\nSignals:\n${e.signals
          .map((s) => `- [${s.kind}] ${s.text}`)
          .join('\n')}\n\nCaution: ${e.caution}\n\nTags: ${e.tags.join(', ')}`,
    )
    .join('\n\n---\n\n')
}

async function runConnectorViaSdk(input: {
  studentId: string
  corpus: string
}): Promise<ConnectorOutputDraft> {
  const agent = buildConnectorAgent({ studentId: input.studentId })
  const result = await run(
    agent,
    `You are reading reflection corpus for student ${input.studentId}. Surface patterns.\n\n${input.corpus}`,
  )
  return result.finalOutput as ConnectorOutputDraft
}

async function runPathfinderViaSdk(input: {
  studentId: string
  connector: ConnectorOutputDraft
}): Promise<PathfinderOutputDraft> {
  const agent = buildPathfinderAgent({ studentId: input.studentId })
  const handoff = `Connector handed off the following patterns:\n\n${JSON.stringify(input.connector, null, 2)}\n\nProduce trajectory + pathways. Verify Connector's evidence IDs by calling search_past_mirrors when needed.`
  const result = await run(agent, handoff)
  return result.finalOutput as PathfinderOutputDraft
}
