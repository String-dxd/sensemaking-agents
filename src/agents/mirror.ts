import { Agent, run } from '@openai/agents'
import mirrorPrompt from '~/agents/mirror.prompt.md?raw'
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
 */
export function buildMirrorAgent({ studentId }: BuildMirrorAgentOpts) {
  return new Agent({
    name: 'mirror',
    model: 'gpt-4.1',
    instructions: mirrorPrompt,
    tools: [searchCorpusToolFor(studentId)],
    outputType: MirrorOutputSchema,
  })
}

export interface RunMirrorOnTranscriptDeps {
  /** Override Mirror invocation. Default: build the agent and call `run`. */
  runMirror?: (input: { studentId: string; transcript: string }) => Promise<MirrorOutputDraft>
}

/**
 * Run Mirror over a transcript, returning the parsed three-part output.
 * Caller is responsible for persistence.
 */
export async function runMirrorOnTranscript(
  studentId: string,
  transcript: string,
  deps: RunMirrorOnTranscriptDeps = {},
): Promise<MirrorOutputDraft> {
  if (deps.runMirror !== undefined) {
    return deps.runMirror({ studentId, transcript })
  }
  const agent = buildMirrorAgent({ studentId })
  const result = await run(
    agent,
    `The student spoke this transcript while looking into a webcam mirror. They are no longer present. Reflect what was said back in three parts.\n\nTranscript:\n\n${transcript}`,
  )
  return MirrorOutputSchema.parse(result.finalOutput)
}
