import { Agent, run } from '@openai/agents'
import { getManagedAgentBinding, isManagedAgentsEnabled, MIRROR_MODEL } from '~/agents/config'
import mirrorPrompt from '~/agents/mirror.prompt.md?raw'
import { runManagedAgent } from '~/agents/runner'
import { type MirrorOutputDraft, MirrorOutputSchema } from '~/agents/schemas'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'

export interface BuildMirrorAgentOpts {
  studentId: string
}

/**
 * Build a Mirror Agent bound to a single studentId. Mirror reads a transcript
 * (the student's own voice, transcribed via Whisper) and produces three
 * editable reflection fields: validation, inferred_meaning, story_reframe.
 *
 * Tool surface (R20 ablation): `search_past_mirrors` only — the same corpus
 * search Mirror used in the realtime path. External lookup and self-critique
 * stay on Connector / Pathfinder.
 *
 * This factory is the OpenAI-runtime path. When `USE_MANAGED_AGENTS=true`,
 * `runMirrorOnTranscript` skips it entirely and dispatches via
 * `src/agents/runner.ts` instead (plan §7.1: pre-fetched context, no tools).
 */
export function buildMirrorAgent({ studentId }: BuildMirrorAgentOpts) {
  return new Agent({
    name: 'mirror',
    model: MIRROR_MODEL,
    instructions: mirrorPrompt,
    tools: [searchCorpusToolFor(studentId)],
    outputType: MirrorOutputSchema,
  })
}

const MIRROR_USER_PROMPT_PREFIX =
  'The student spoke this transcript while looking into a webcam mirror. They are no longer present. Reflect what was said back in three parts.\n\nTranscript:\n\n'

export interface RunMirrorOnTranscriptDeps {
  /** Override Mirror invocation. Default: build the agent and call `run`. */
  runMirror?: (input: { studentId: string; transcript: string }) => Promise<MirrorOutputDraft>
}

/**
 * Run Mirror over a transcript, returning the parsed three-part output.
 * Caller is responsible for persistence.
 *
 * Routing precedence:
 *   1. `deps.runMirror` (test injection — wins over both runtimes).
 *   2. `USE_MANAGED_AGENTS=true` → Anthropic Managed Agents via `runManagedAgent`.
 *   3. Default → OpenAI Agents SDK via the v0.1 `Agent` + `run` path.
 *
 * The Managed Agents path does NOT bind `search_past_mirrors` as a tool.
 * Per plan §7.1 ("prompt-as-context, not agent-as-runtime") the server
 * pre-fetches the corpus and packs it into the user message; Steps 8/9
 * extend this to Connector + Cartographer. Mirror itself has not needed
 * corpus search in practice, so the migration leaves it without tools.
 */
export async function runMirrorOnTranscript(
  studentId: string,
  transcript: string,
  deps: RunMirrorOnTranscriptDeps = {},
): Promise<MirrorOutputDraft> {
  if (deps.runMirror !== undefined) {
    return deps.runMirror({ studentId, transcript })
  }
  if (isManagedAgentsEnabled()) {
    const binding = getManagedAgentBinding('mirror')
    const result = await runManagedAgent({
      agentId: binding.agentId,
      ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
      environmentId: binding.environmentId,
      prompt: `${MIRROR_USER_PROMPT_PREFIX}${transcript}`,
      outputSchema: MirrorOutputSchema,
      sessionTitle: `mirror:${studentId}`,
    })
    return result.output
  }
  const agent = buildMirrorAgent({ studentId })
  const result = await run(agent, `${MIRROR_USER_PROMPT_PREFIX}${transcript}`)
  return MirrorOutputSchema.parse(result.finalOutput)
}
