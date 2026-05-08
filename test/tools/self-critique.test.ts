import { describe, expect, it, vi } from 'vitest'
import {
  executeSelfCritique,
  SELF_CRITIQUE_NAME,
  selfCritiqueTool,
} from '~/agents/tools/self-critique'

describe('self-critique', () => {
  it('parses the response against SelfCritiqueOutputSchema', async () => {
    const runCritique = vi.fn().mockResolvedValue({
      critique: 'The pathway claim is generic and not tied to any reflection ID.',
      suggestions: ['Cite reflection #6 specifically.'],
      confidence: 'medium',
    })
    const result = await executeSelfCritique(
      { draft: JSON.stringify({ trajectory: 'something' }), dimension: 'evidence' },
      { runCritique },
    )
    expect(result.critique).toMatch(/generic/)
    expect(result.suggestions).toHaveLength(1)
    expect(result.confidence).toBe('medium')
    expect(runCritique).toHaveBeenCalledOnce()
  })

  it('rejects malformed runCritique output via Zod', async () => {
    const runCritique = vi.fn().mockResolvedValue({
      critique: 'ok',
      suggestions: ['fine'],
      confidence: 'maybe', // invalid enum value
    })
    await expect(
      executeSelfCritique({ draft: 'irrelevant', dimension: 'sycophancy' }, { runCritique }),
    ).rejects.toThrow()
  })

  it('SDK tool registers the right name', () => {
    expect(selfCritiqueTool.name).toBe(SELF_CRITIQUE_NAME)
  })
})
