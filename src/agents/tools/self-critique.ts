import Anthropic from '@anthropic-ai/sdk'
import { Agent, run, tool } from '@openai/agents'
import { SELF_CRITIQUE_MODEL } from '../config'
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

const SYSTEM_PROMPT = `You are a critique-only reviewer. You will be given a draft from another agent (Connector or Pathfinder) and one specific dimension to evaluate it against. Return a structured critique. Do not rewrite the draft. Do not be polite for politeness's sake. Confidence: low / medium / high based on how strong your evidence is.

Respond with a single JSON object matching this shape exactly:
{
  "critique": string,
  "suggestions": string[],
  "confidence": "low" | "medium" | "high"
}

Output nothing but the JSON object — no prose, no fences, no preamble.`

/**
 * Anthropic model id for the self-critique Messages API call. Reads from
 * `ANTHROPIC_SELF_CRITIQUE_MODEL` with a `claude-haiku-4-5` fallback. `||`
 * (not `??`) intentionally treats an empty-string override as unset.
 *
 * Evaluated at call time (not module load) so test overrides and the ablate
 * script's argv parsing still see the latest `process.env` value.
 */
function resolveAnthropicModel(): string {
  return process.env.ANTHROPIC_SELF_CRITIQUE_MODEL || 'claude-haiku-4-5'
}

let cachedClient: Anthropic | undefined

function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'self-critique: ANTHROPIC_API_KEY is not set. The self-critique tool calls Anthropic Messages API directly (Haiku) and requires this env var.',
    )
  }
  cachedClient = new Anthropic({ apiKey })
  return cachedClient
}

function buildUserMessage(input: SelfCritiqueInput): string {
  return `Dimension: ${input.dimension}\nFocus: ${CRITIQUE_INSTRUCTIONS_BY_DIMENSION[input.dimension]}\n\nDraft (JSON):\n${input.draft}`
}

/**
 * Strip optional ```json ... ``` fences a model might wrap the JSON in, even
 * though the system prompt forbids them. Conservative — only trims the outer
 * fence pair when present.
 */
function unwrapJsonFence(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) {
    const withoutOpen = trimmed.replace(/^```(?:json)?\s*/, '')
    return withoutOpen.replace(/\s*```\s*$/, '').trim()
  }
  return trimmed
}

/**
 * Function-style self-critique API (plan §7.2). Calls Anthropic's Messages
 * API with Haiku, no further tool use, and parses the response against
 * `SelfCritiqueOutputSchema`. This is the canonical post-migration entry
 * point — Connector and Cartographer call it as a plain function inside
 * their Managed-Agent code paths.
 *
 * Throws if `ANTHROPIC_API_KEY` is unset, if the Messages API returns no
 * text content, or if the text fails to parse against the output schema.
 */
export async function selfCritique(input: SelfCritiqueInput): Promise<SelfCritiqueOutput> {
  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: resolveAnthropicModel(),
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  })

  const textBlock = response.content.find(
    (block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text',
  )
  if (!textBlock) {
    throw new Error(
      `self-critique: Anthropic Messages API returned no text block (stop_reason=${response.stop_reason ?? 'unknown'}).`,
    )
  }

  const raw = unwrapJsonFence(textBlock.text)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `self-critique: failed to parse Anthropic response as JSON (${err instanceof Error ? err.message : String(err)}). Raw text: ${textBlock.text.slice(0, 200)}`,
    )
  }
  return SelfCritiqueOutputSchema.parse(parsedJson)
}

export interface ExecuteSelfCritiqueDeps {
  /** Override for tests — defaults to the Anthropic Messages API path. */
  runCritique?: (input: SelfCritiqueInput) => Promise<SelfCritiqueOutput>
}

/**
 * Back-compat wrapper around `selfCritique`. Validates raw input via Zod
 * (so the OpenAI tool wrapper's untyped `execute` arg stays type-safe) and
 * either delegates to the test-injected `deps.runCritique` or to the
 * Anthropic-backed `selfCritique` function. The legacy OpenAI Agent path
 * is intentionally removed — per plan §7.2, self-critique runs on Anthropic
 * Haiku even pre-cutover.
 */
export async function executeSelfCritique(
  rawInput: unknown,
  deps: ExecuteSelfCritiqueDeps = {},
): Promise<SelfCritiqueOutput> {
  const input = SelfCritiqueInputSchema.parse(rawInput)
  if (deps.runCritique) {
    return SelfCritiqueOutputSchema.parse(await deps.runCritique(input))
  }
  return selfCritique(input)
}

/**
 * Legacy `@openai/agents` Agent constructor for self-critique. Kept around
 * as a no-op export point for the OpenAI runner's tool registration shape,
 * but the default `executeSelfCritique` path no longer uses it — Anthropic
 * Messages API is the only live backend. Lazy-init so `SELF_CRITIQUE_MODEL`
 * is read at first use (not module load), preserving the ablate
 * `--model=` override seam.
 *
 * @internal
 */
let cachedLegacyAgent: ReturnType<typeof buildLegacyCritiqueAgent> | undefined
function buildLegacyCritiqueAgent() {
  return new Agent({
    name: 'self-critique',
    model: SELF_CRITIQUE_MODEL,
    instructions: SYSTEM_PROMPT,
    outputType: SelfCritiqueOutputSchema,
  })
}
export function getLegacyCritiqueAgent(): ReturnType<typeof buildLegacyCritiqueAgent> {
  if (!cachedLegacyAgent) {
    cachedLegacyAgent = buildLegacyCritiqueAgent()
  }
  return cachedLegacyAgent
}

/**
 * Legacy OpenAI-runner entry point that hits the `@openai/agents` runtime.
 * Retained for back-compat with any caller that wants to A/B against the
 * pre-migration path; the live system routes through `selfCritique` /
 * `executeSelfCritique` instead.
 *
 * @internal
 */
export async function runLegacyCritiqueViaOpenAiAgent(
  input: SelfCritiqueInput,
): Promise<SelfCritiqueOutput> {
  const agent = getLegacyCritiqueAgent()
  const result = await run(agent, buildUserMessage(input))
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
