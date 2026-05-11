import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * U4 — Centralized model config.
 *
 * The module reads `process.env.AGENT_MODEL` once at module-load time and
 * exports four per-agent constants. We use `vi.resetModules()` plus dynamic
 * `import()` so each scenario gets a fresh evaluation against the current
 * env.
 *
 * `||` (not `??`) is intentional: an empty-string `AGENT_MODEL=` is treated
 * as unset and falls through to the default. This matches the way operators
 * unset env vars in a shell pipeline.
 */

const DEFAULT_MODEL = 'gpt-5.5'

describe('src/agents/config', () => {
  let originalAgentModel: string | undefined

  beforeEach(() => {
    originalAgentModel = process.env.AGENT_MODEL
    delete process.env.AGENT_MODEL
    vi.resetModules()
  })

  afterEach(() => {
    if (originalAgentModel === undefined) {
      delete process.env.AGENT_MODEL
    } else {
      process.env.AGENT_MODEL = originalAgentModel
    }
    vi.resetModules()
  })

  it('returns the v0.2 default for every agent when AGENT_MODEL is unset', async () => {
    const config = await import('~/agents/config')
    expect(config.MIRROR_MODEL).toBe(DEFAULT_MODEL)
    expect(config.CONNECTOR_MODEL).toBe(DEFAULT_MODEL)
    expect(config.CARTOGRAPHER_MODEL).toBe(DEFAULT_MODEL)
    expect(config.SELF_CRITIQUE_MODEL).toBe(DEFAULT_MODEL)
  })

  it('honors AGENT_MODEL when re-imported via vi.resetModules', async () => {
    process.env.AGENT_MODEL = 'gpt-4.1'
    const config = await import('~/agents/config')
    expect(config.MIRROR_MODEL).toBe('gpt-4.1')
    expect(config.CONNECTOR_MODEL).toBe('gpt-4.1')
    expect(config.CARTOGRAPHER_MODEL).toBe('gpt-4.1')
    expect(config.SELF_CRITIQUE_MODEL).toBe('gpt-4.1')
  })

  it('treats an empty-string AGENT_MODEL as unset (|| not ??)', async () => {
    process.env.AGENT_MODEL = ''
    const config = await import('~/agents/config')
    expect(config.MIRROR_MODEL).toBe(DEFAULT_MODEL)
    expect(config.CONNECTOR_MODEL).toBe(DEFAULT_MODEL)
    expect(config.CARTOGRAPHER_MODEL).toBe(DEFAULT_MODEL)
    expect(config.SELF_CRITIQUE_MODEL).toBe(DEFAULT_MODEL)
  })

  it('keeps all per-agent constants in lockstep when AGENT_MODEL is set', async () => {
    process.env.AGENT_MODEL = 'gpt-5.5-mini'
    const config = await import('~/agents/config')
    const values = new Set([
      config.MIRROR_MODEL,
      config.CONNECTOR_MODEL,
      config.CARTOGRAPHER_MODEL,
      config.SELF_CRITIQUE_MODEL,
    ])
    expect(values.size).toBe(1)
    expect(values.has('gpt-5.5-mini')).toBe(true)
  })
})
