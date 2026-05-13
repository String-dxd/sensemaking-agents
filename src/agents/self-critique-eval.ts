import { getManagedAgentBinding } from '~/agents/config'
import {
  type RunManagedAgentOptions,
  type RunManagedAgentResult,
  runManagedAgent,
} from '~/agents/runner'
import {
  type SelfCritiqueInput,
  type SelfCritiqueOutput,
  SelfCritiqueOutputSchema,
} from '~/agents/tools/schemas'

export type AgentUnderReview = 'mirror' | 'connector' | 'cartographer'

export interface SelfCritiqueReviewInput {
  agent: AgentUnderReview
  draft: unknown
  focus?: NonNullable<SelfCritiqueInput['focus']>
  sourceContext?: string
}

type SelfCritiqueRunner = (
  opts: RunManagedAgentOptions<SelfCritiqueOutput>,
) => Promise<RunManagedAgentResult<SelfCritiqueOutput>>

export interface SelfCritiqueReviewDeps {
  runManaged?: SelfCritiqueRunner
  warn?: (message: string, meta?: unknown) => void
}

export async function runSelfCritiqueReview(
  input: SelfCritiqueReviewInput,
  deps: SelfCritiqueReviewDeps = {},
): Promise<SelfCritiqueOutput> {
  const binding = getManagedAgentBinding('self_critique')
  const runner = deps.runManaged ?? runManagedAgent
  const result = await runner({
    agentId: binding.agentId,
    ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
    environmentId: binding.environmentId,
    prompt: formatSelfCritiquePrompt(input),
    outputSchema: SelfCritiqueOutputSchema,
    sessionTitle: `self_critique:${input.agent}`,
    timeoutMs: 60_000,
  })
  return result.output
}

export async function runSelfCritiqueReviewBestEffort(
  input: SelfCritiqueReviewInput,
  deps: SelfCritiqueReviewDeps = {},
): Promise<SelfCritiqueOutput | null> {
  if (!process.env.MANAGED_AGENT_SELF_CRITIQUE_ID || !process.env.MANAGED_AGENT_ENV_ID) {
    return null
  }

  try {
    return await runSelfCritiqueReview(input, deps)
  } catch (err) {
    ;(deps.warn ?? console.warn)('[self_critique] eval review failed; continuing', {
      agent: input.agent,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    })
    return null
  }
}

export function summarizeSelfCritiqueReview(review: SelfCritiqueOutput | null): string | null {
  if (!review) return null
  const verdict = review.verdict ?? 'pass_with_warnings'
  const risk = review.risk_level ?? 'medium'
  return `self_critique ${verdict}/${risk}: ${review.critique}`
}

function formatSelfCritiquePrompt(input: SelfCritiqueReviewInput): string {
  const focus = input.focus?.length ? input.focus.join(', ') : 'all eval dimensions'
  const sourceContext = input.sourceContext?.trim()
  const body: SelfCritiqueInput = {
    draft: JSON.stringify(input.draft),
    agent: input.agent,
    focus: input.focus,
    ...(sourceContext ? { source_context: sourceContext } : {}),
  }

  return [
    `Review the ${input.agent} agent output for quality and safety.`,
    `Focus: ${focus}.`,
    '',
    'Return JSON matching your eval schema. Do not rewrite the full draft.',
    '',
    sourceContext ? `# Source context\n${sourceContext}\n` : null,
    '# Draft payload',
    JSON.stringify(body, null, 2),
  ]
    .filter((part): part is string => part !== null)
    .join('\n')
}
