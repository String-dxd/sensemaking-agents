import { Agent, run, tool } from '@openai/agents'
import {
  type SelfCritiqueInput,
  SelfCritiqueInputSchema,
  type SelfCritiqueOutput,
  SelfCritiqueOutputSchema,
} from './schemas'

export const SELF_CRITIQUE_NAME = 'self_critique'

const DESCRIPTION =
  "Re-read the agent's draft against one specific dimension (evidence, sycophancy, or specificity) and return a critique plus suggestions. Use sparingly — once per loop iteration is enough."

const CRITIQUE_INSTRUCTIONS_BY_DIMENSION: Record<SelfCritiqueInput['dimension'], string> = {
  evidence:
    'Examine the draft for unsupported claims. Every assertion about a pattern must reference at least one reflection ID. Flag sentences that drift into general advice without grounded evidence.',
  sycophancy:
    'Examine the draft for praise, agreement, or validation that is not load-bearing. The student is not asking to be reassured; they are asking to be seen. Flag agreement-shaped sentences and propose harder, less complimentary alternatives that still respect the student.',
  specificity:
    'Examine the draft for vagueness — "explore your interests," "consider your strengths," "be open." Flag every generality and propose a concrete alternative tied to the actual reflections in evidence.',
}

const SYSTEM_PROMPT = `You are a critique-only reviewer. You will be given a draft from another agent (Connector or Pathfinder) and one specific dimension to evaluate it against. Return a structured critique. Do not rewrite the draft. Do not be polite for politeness's sake. Confidence: low / medium / high based on how strong your evidence is.`

const critiqueAgent = new Agent({
  name: 'self-critique',
  model: 'gpt-4.1',
  instructions: SYSTEM_PROMPT,
  outputType: SelfCritiqueOutputSchema,
})

export interface ExecuteSelfCritiqueDeps {
  /** Override for tests — defaults to invoking the SDK Runner. */
  runCritique?: (input: SelfCritiqueInput) => Promise<SelfCritiqueOutput>
}

export async function executeSelfCritique(
  rawInput: unknown,
  deps: ExecuteSelfCritiqueDeps = {},
): Promise<SelfCritiqueOutput> {
  const input = SelfCritiqueInputSchema.parse(rawInput)
  if (deps.runCritique) {
    return SelfCritiqueOutputSchema.parse(await deps.runCritique(input))
  }
  const userMessage = `Dimension: ${input.dimension}\nFocus: ${CRITIQUE_INSTRUCTIONS_BY_DIMENSION[input.dimension]}\n\nDraft:\n${JSON.stringify(input.draft, null, 2)}`
  const result = await run(critiqueAgent, userMessage)
  return SelfCritiqueOutputSchema.parse(result.finalOutput)
}

export const selfCritiqueTool = tool({
  name: SELF_CRITIQUE_NAME,
  description: DESCRIPTION,
  parameters: SelfCritiqueInputSchema,
  execute: async (input: SelfCritiqueInput) => {
    const output = await executeSelfCritique(input)
    return JSON.stringify(output)
  },
})
