import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  runSelfCritiqueReview,
  runSelfCritiqueReviewBestEffort,
  summarizeSelfCritiqueReview,
} from '~/agents/self-critique-eval'
import { SelfCritiqueOutputSchema } from '~/agents/tools/schemas'

const SAVED_ENV = { ...process.env }

function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in SAVED_ENV)) delete process.env[k]
  }
  for (const [k, v] of Object.entries(SAVED_ENV)) {
    if (v !== undefined) process.env[k] = v
  }
}

const REVIEW = SelfCritiqueOutputSchema.parse({
  verdict: 'pass_with_warnings',
  risk_level: 'medium',
  critique: 'The draft is mostly grounded but should soften one broad claim.',
  findings: [
    {
      category: 'evidence_grounding',
      severity: 'medium',
      issue: 'One sentence generalizes beyond the supplied quote.',
      recommendation: 'Tie the claim back to the quote or remove it.',
    },
  ],
  suggestions: ['Replace the stable-trait phrasing with behavior-shape language.'],
  confidence: 'high',
})

describe('self_critique eval reviewer', () => {
  beforeEach(() => {
    restoreEnv()
    process.env.MANAGED_AGENT_SELF_CRITIQUE_ID = 'agt_eval'
    process.env.MANAGED_AGENT_SELF_CRITIQUE_VERSION = '2'
    process.env.MANAGED_AGENT_ENV_ID = 'env_eval'
  })

  afterEach(() => {
    restoreEnv()
  })

  it('dispatches to the self_critique managed agent with output, context, and focus', async () => {
    const runManaged = vi.fn(async (opts) => ({
      output: REVIEW,
      sessionId: 'sesn_eval',
      rawText: JSON.stringify(REVIEW),
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      prompt: opts.prompt,
    }))

    const result = await runSelfCritiqueReview(
      {
        agent: 'connector',
        draft: { diffs: { values: { compiled_truth_rewrite: 'A broad claim.' } } },
        focus: ['evidence_grounding', 'taxonomy_fit', 'safety'],
        sourceContext: 'Mirror quote: "I helped because it mattered."',
      },
      { runManaged },
    )

    expect(result.verdict).toBe('pass_with_warnings')
    expect(runManaged).toHaveBeenCalledOnce()
    const call = runManaged.mock.calls[0]?.[0]
    expect(call?.agentId).toBe('agt_eval')
    expect(call?.agentVersion).toBe(2)
    expect(call?.environmentId).toBe('env_eval')
    expect(call?.sessionTitle).toBe('self_critique:connector')
    expect(call?.prompt).toContain('Review the connector agent output')
    expect(call?.prompt).toContain('taxonomy_fit')
    expect(call?.prompt).toContain('Mirror quote')
  })

  it('best-effort mode skips cleanly when the eval binding is absent', async () => {
    delete process.env.MANAGED_AGENT_SELF_CRITIQUE_ID
    const runManaged = vi.fn()

    await expect(
      runSelfCritiqueReviewBestEffort(
        { agent: 'mirror', draft: { validation: 'v' }, focus: ['safety'] },
        { runManaged },
      ),
    ).resolves.toBeNull()
    expect(runManaged).not.toHaveBeenCalled()
  })

  it('summarizes eval reviews for handler warnings', () => {
    expect(summarizeSelfCritiqueReview(REVIEW)).toContain('pass_with_warnings/medium')
    expect(summarizeSelfCritiqueReview(null)).toBeNull()
  })
})
