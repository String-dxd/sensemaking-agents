#!/usr/bin/env tsx
// @ts-nocheck — diagnostic script; works at runtime, generic Agent variance noisy under tsc.
/**
 * Live smoke test for the v0.2 Cartographer Trajectory-page chain. Hits the
 * real OpenAI API. Use a separate DATABASE_PATH so it doesn't trample
 * `app.db`.
 *
 *   DATABASE_PATH=/tmp/smoke.db pnpm exec tsx scripts/smoke-sensemaking.ts
 *
 * v0.2 (U11): replaces the v0.1 Connector → Pathfinder smoke. The v0.2
 * surface is a single-agent Cartographer run that reads the four VIPS
 * pages + corpus and emits a `CartographerOutputSchema`-shaped Trajectory
 * page (trajectory_paragraph + 2–5 lead-sheet pathways + open_questions +
 * disclaimer). Output assertion shape changes accordingly.
 *
 * Mirrors `scripts/ablate.ts` and reads prompts from disk because tsx
 * can't resolve Vite's `?raw` markdown imports outside the dev server.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Agent, run } from '@openai/agents'
import { CARTOGRAPHER_MODEL } from '~/agents/config'
import {
  type AgentName,
  type RunStepEvent,
  type RunStepEventInput,
  truncate,
} from '~/agents/run-events'
import { type CartographerOutputDraft, CartographerOutputSchema } from '~/agents/schemas'
import { lookupEcgTaxonomyTool } from '~/agents/tools/lookup-ecg-taxonomy'
import { lookupVipsTaxonomyTool } from '~/agents/tools/lookup-vips-taxonomy'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { selfCritiqueTool } from '~/agents/tools/self-critique'
import { openDb } from '~/db/client'
import {
  insertCartographerOutput,
  listMirrorEntries,
  listVipsPages,
  listVipsTimelineEntries,
} from '~/db/queries'
import { seed } from '~/db/seed'

const cartographerPrompt = readFileSync(resolve('src/agents/cartographer.prompt.md'), 'utf8')

const VIPS_DIMENSIONS = ['values', 'interests', 'personality', 'skills'] as const

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
  console.log('Starting Cartographer Trajectory-page generation...\n')

  const start = Date.now()
  const events: RunStepEvent[] = []
  const emit = (e: RunStepEventInput) => {
    events.push({ ...e, timestampMs: Date.now() - start } as RunStepEvent)
  }

  const prompt = formatPromptContext()

  emit({ type: 'agent_started', agent: 'cartographer' })
  let row: { id: number } | null = null
  let partial = false
  try {
    const out = await streamedRun(
      'cartographer',
      () =>
        new Agent({
          name: 'cartographer',
          model: CARTOGRAPHER_MODEL,
          instructions: cartographerPrompt,
          tools: [
            searchCorpusToolFor('demo'),
            lookupEcgTaxonomyTool,
            lookupVipsTaxonomyTool,
            selfCritiqueTool,
          ],
          outputType: CartographerOutputSchema,
        }),
      prompt,
      emit,
    )
    const validated: CartographerOutputDraft = CartographerOutputSchema.parse(out)
    row = insertCartographerOutput('demo', {
      trajectory_text: validated.trajectory_paragraph,
      pathways: validated.pathways as unknown as Parameters<
        typeof insertCartographerOutput
      >[1]['pathways'],
      open_questions: validated.open_questions,
      disclaimer: validated.disclaimer,
      raw_output: validated,
      trace: {
        agent: 'cartographer',
        events_captured: events.length,
      },
    })
    emit({
      type: 'agent_completed',
      agent: 'cartographer',
      outputPreview: truncate(validated.trajectory_paragraph),
    })
  } catch (err) {
    partial = true
    emit({
      type: 'error',
      agent: 'cartographer',
      message: err instanceof Error ? err.message : String(err),
    })
  }

  emit({
    type: 'run_completed',
    connectorOutputId: -1,
    pathfinderOutputId: row?.id ?? null,
    partial,
  })

  console.log(`\n=== RESULT in ${((Date.now() - start) / 1000).toFixed(1)}s ===`)
  console.log(`Cartographer row id: ${row?.id ?? '(none)'}`)
  console.log(`Partial: ${partial}`)
  console.log(`Events captured: ${events.length}\n`)
  console.log('Event timeline:')
  for (const ev of events) {
    const t = `${(ev.timestampMs / 1000).toFixed(1)}s`
    if (ev.type === 'tool_call_started') {
      console.log(`  [${t}] ${ev.agent}: TOOL ${ev.toolName} (${ev.argsPreview.slice(0, 80)})`)
    } else if (ev.type === 'tool_call_completed') {
      console.log(`  [${t}] ${ev.agent}: tool ${ev.toolName} → ${ev.resultPreview.slice(0, 80)}`)
    } else if (ev.type === 'agent_started') {
      console.log(`  [${t}] ${ev.agent} STARTED`)
    } else if (ev.type === 'agent_completed') {
      console.log(`  [${t}] ${ev.agent} COMPLETED: ${ev.outputPreview.slice(0, 80)}`)
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

function formatPromptContext(): string {
  const pages = listVipsPages('demo')
  const timeline = VIPS_DIMENSIONS.flatMap((dim) =>
    listVipsTimelineEntries('demo', dim, { includeForgotten: false }),
  )
  const entries = listMirrorEntries('demo', { limit: 200 })

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
              (e) => `- id=${e.id} [${e.canonical_claim_id}] (${e.strength}) "${e.verbatim_quote}"`,
            )
            .join('\n')}`,
    ].join('\n')
  }).join('\n\n')

  const corpus =
    entries.length === 0
      ? 'No prior reflections.'
      : entries
          .slice()
          .reverse()
          .map(
            (e) =>
              `# Reflection #${e.id} — ${e.created_at} (context=${e.context_type})\n\nStory: ${e.story_reframe}\nTranscript: ${e.transcript}`,
          )
          .join('\n\n---\n\n')

  return `# Trajectory pass for student demo\n\n# Current VIPS pages\n\n${pagesBlock}\n\n# Mirror corpus (background)\n\n${corpus}\n\nProduce a CartographerOutputSchema-shaped Trajectory page. trait_combination claim_ids must appear on a current timeline entry above; ecg_region_tags must be cluster-level IDs.`
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
