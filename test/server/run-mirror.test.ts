import { afterEach, describe, expect, it, vi } from 'vitest'
import { runMirrorForStudent } from '~/server/run-mirror.handler.server'

const savedEnv = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key]
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value !== undefined) process.env[key] = value
  }
})

describe('runMirrorForStudent', () => {
  it('uses OpenAI Realtime by default instead of requiring a managed Mirror agent', async () => {
    delete process.env.MANAGED_AGENT_MIRROR_ID
    delete process.env.MANAGED_AGENT_SELF_CRITIQUE_ID
    delete process.env.MANAGED_AGENT_ENV_ID
    const openAIRealtimeMirror = vi.fn(async () => ({
      validation: 'That mattered.',
      inferred_meaning: 'Maybe it felt important because it was yours.',
      story_reframe: 'You made the thing and noticed it mattered.',
    }))

    const result = await runMirrorForStudent('demo', 'I built the project myself.', {
      openAIRealtimeMirror,
    })

    expect(openAIRealtimeMirror).toHaveBeenCalledWith({
      studentId: 'demo',
      transcript: 'I built the project myself.',
    })
    expect(result.output).toEqual({
      validation: 'That mattered.',
      inferred_meaning: 'Maybe it felt important because it was yours.',
      story_reframe: 'You made the thing and noticed it mattered.',
    })
    expect(result.eval_review).toBeNull()
  })

  it('preserves the runMirror override seam', async () => {
    delete process.env.MANAGED_AGENT_SELF_CRITIQUE_ID
    delete process.env.MANAGED_AGENT_ENV_ID
    const runMirror = vi.fn(async () => ({
      validation: 'Override validation.',
      inferred_meaning: 'Override meaning.',
      story_reframe: 'Override story.',
    }))
    const openAIRealtimeMirror = vi.fn()

    const result = await runMirrorForStudent('demo', 'override me', {
      runMirror,
      openAIRealtimeMirror,
      selfCritique: { warn: vi.fn() },
    })

    expect(runMirror).toHaveBeenCalledWith({ studentId: 'demo', transcript: 'override me' })
    expect(openAIRealtimeMirror).not.toHaveBeenCalled()
    expect(result.output.story_reframe).toBe('Override story.')
  })
})
