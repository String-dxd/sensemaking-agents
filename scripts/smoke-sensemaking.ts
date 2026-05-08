#!/usr/bin/env tsx
// @ts-nocheck — diagnostic script; works at runtime, generic Agent variance noisy under tsc.
/**
 * Live smoke test for the Connector → Pathfinder chain. Hits the real
 * OpenAI API. Use a separate DATABASE_PATH so it doesn't trample
 * `app.db`.
 *
 *   DATABASE_PATH=/tmp/smoke.db pnpm exec tsx scripts/smoke-sensemaking.ts
 *
 * Mirrors `scripts/ablate.ts` and reads prompts from disk because tsx
 * can't resolve Vite's `?raw` markdown imports outside the dev server.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Agent, run } from '@openai/agents'
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
import { lookupEcgTaxonomyTool } from '~/agents/tools/lookup-ecg-taxonomy'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { selfCritiqueTool } from '~/agents/tools/self-critique'
import { openDb } from '~/db/client'
import {
  insertConnectorOutput,
  insertPathfinderOutput,
  listMirrorEntries,
} from '~/db/queries'
import { seed } from '~/db/seed'

const connectorPrompt = readFileSync(resolve('src/agents/connector.prompt.md'), 'utf8')
const pathfinderPrompt = readFileSync(resolve('src/agents/pathfinder.prompt.md'), 'utf8')

async function streamedRun(
  agent: AgentName,
  buildAgent: () => Agent<unknown, unknown>,
  prompt: string,
  emit: (e: RunStepEventInput) => void,
): Promise<unknown> {
  const sdkAgent = buildAgent()
  const stream = await run(sdkAgent, prompt, { stream: true })
  for await (const ev of stream) {
    if (!ev || typeof ev !== 'object') continue
    const evObj = ev as Record<string, unknown>
    if (evObj.type !== 'run_item_stream_event') continue
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
    } else if (name === 'tool_output' || itemType === 'tool_call_output_item') {
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
    } else if (name === 'reasoning_item_created' || itemType === 'reasoning_item') {
      emit({ type: 'reasoning', agent })
    }
  }
  // biome-ignore lint/suspicious/noExplicitAny: stream is the SDK return shape
  return (stream as any).finalOutput
}

async function main() {
  const db = openDb()
  const before = listMirrorEntries('demo').length
  if (before < 3) {
    console.log(`Seeding (current: ${before})...`)
    seed({ db })
  }
  console.log(`Corpus size: ${listMirrorEntries('demo').length}`)
  console.log('Starting Connector → Pathfinder chain...\n')

  const start = Date.now()
  const events: RunStepEvent[] = []
  const emit = (e: RunStepEventInput) => {
    events.push({ ...e, timestampMs: Date.now() - start } as RunStepEvent)
  }

  const corpus = formatCorpus()
  let result: RunSensemakingResult

  // ── Connector ─────────────────────────────────────────────────────────
  emit({ type: 'agent_started', agent: 'connector' })
  let connectorDraft: ConnectorOutputDraft
  let connectorRowId: number | null = null
  try {
    const out = await streamedRun(
      'connector',
      () =>
        new Agent({
          name: 'connector',
          model: 'gpt-4.1',
          instructions: connectorPrompt,
          tools: [searchCorpusToolFor('demo'), lookupEcgTaxonomyTool, selfCritiqueTool],
          outputType: ConnectorOutputSchema,
        }),
      `You are reading reflection corpus for student demo. Surface patterns.\n\n${corpus}`,
      emit,
    )
    connectorDraft = ConnectorOutputSchema.parse(out)
    const row = insertConnectorOutput('demo', {
      patterns: connectorDraft.patterns,
      still_unclear: connectorDraft.still_unclear,
      trace: { agent: 'connector' },
    })
    connectorRowId = row.id
    emit({
      type: 'agent_completed',
      agent: 'connector',
      outputPreview: truncate(JSON.stringify(connectorDraft.patterns.slice(0, 1))),
    })
  } catch (err) {
    emit({ type: 'error', agent: 'connector', message: err instanceof Error ? err.message : String(err) })
    result = {
      events,
      totalDurationMs: Date.now() - start,
      connectorOutputId: null,
      pathfinderOutputId: null,
      partial: true,
    }
    print(result)
    return
  }

  emit({ type: 'handoff', from: 'connector', to: 'pathfinder' })

  // ── Pathfinder ────────────────────────────────────────────────────────
  emit({ type: 'agent_started', agent: 'pathfinder' })
  let pathfinderRowId: number | null = null
  let partial = false
  try {
    const out = await streamedRun(
      'pathfinder',
      () =>
        new Agent({
          name: 'pathfinder',
          model: 'gpt-4.1',
          instructions: pathfinderPrompt,
          tools: [searchCorpusToolFor('demo'), lookupEcgTaxonomyTool, selfCritiqueTool],
          outputType: PathfinderOutputSchema,
        }),
      `Connector handed off the following patterns:\n\n${JSON.stringify(connectorDraft, null, 2)}\n\nProduce trajectory + pathways.`,
      emit,
    )
    const validated = PathfinderOutputSchema.parse(out)
    const row = insertPathfinderOutput('demo', {
      trajectory: validated.trajectory,
      pathways: validated.pathways,
      disclaimer: validated.disclaimer,
      connector_output_id: connectorRowId,
      trace: { agent: 'pathfinder', handoff_from: connectorRowId },
    })
    pathfinderRowId = row.id
    emit({
      type: 'agent_completed',
      agent: 'pathfinder',
      outputPreview: truncate(validated.trajectory),
    })
  } catch (err) {
    partial = true
    emit({
      type: 'error',
      agent: 'pathfinder',
      message: err instanceof Error ? err.message : String(err),
    })
  }

  emit({
    type: 'run_completed',
    connectorOutputId: connectorRowId ?? -1,
    pathfinderOutputId: pathfinderRowId,
    partial,
  })

  result = {
    events,
    totalDurationMs: Date.now() - start,
    connectorOutputId: connectorRowId,
    pathfinderOutputId: pathfinderRowId,
    partial,
  }
  print(result)
}

function formatCorpus(): string {
  const entries = listMirrorEntries('demo', { limit: 200 })
  if (entries.length === 0) return 'No prior reflections.'
  return entries
    .slice()
    .reverse()
    .map(
      (e) =>
        `# Reflection #${e.id} — ${e.created_at}\n\nStory: ${e.story_reframe}\nValidation: ${e.validation}\nInferred meaning: ${e.inferred_meaning}\n\nTranscript: ${e.transcript}`,
    )
    .join('\n\n---\n\n')
}

function print(result: RunSensemakingResult) {
  console.log(`\n=== RESULT in ${(result.totalDurationMs / 1000).toFixed(1)}s ===`)
  console.log(`Connector row id: ${result.connectorOutputId}`)
  console.log(`Pathfinder row id: ${result.pathfinderOutputId}`)
  console.log(`Partial: ${result.partial}`)
  console.log(`Events captured: ${result.events.length}\n`)
  console.log('Event timeline:')
  for (const ev of result.events) {
    const t = `${(ev.timestampMs / 1000).toFixed(1)}s`
    if (ev.type === 'tool_call_started') {
      console.log(`  [${t}] ${ev.agent}: TOOL ${ev.toolName} (${ev.argsPreview.slice(0, 80)})`)
    } else if (ev.type === 'tool_call_completed') {
      console.log(`  [${t}] ${ev.agent}: tool ${ev.toolName} → ${ev.resultPreview.slice(0, 80)}`)
    } else if (ev.type === 'agent_started') {
      console.log(`  [${t}] ${ev.agent} STARTED`)
    } else if (ev.type === 'agent_completed') {
      console.log(`  [${t}] ${ev.agent} COMPLETED: ${ev.outputPreview.slice(0, 80)}`)
    } else if (ev.type === 'handoff') {
      console.log(`  [${t}] HANDOFF ${ev.from} → ${ev.to}`)
    } else if (ev.type === 'run_completed') {
      console.log(`  [${t}] RUN COMPLETE (partial=${ev.partial})`)
    } else if (ev.type === 'error') {
      console.log(`  [${t}] ERROR (${ev.agent}): ${ev.message}`)
    } else if (ev.type === 'reasoning') {
      console.log(`  [${t}] ${ev.agent}: thinking…`)
    } else if (ev.type === 'message_output') {
      console.log(`  [${t}] ${ev.agent}: msg "${ev.preview.slice(0, 80)}"`)
    }
  }
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
