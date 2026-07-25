import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ManagedAgentError,
  type ManagedAgentRunnerEvent,
  type ManagedAgentTransport,
  runManagedAgent,
  translateSdkEvent,
} from '~/agents/runner'
import { MirrorOutputSchema } from '~/agents/schemas'

/**
 * Mirror on Managed Agents. Two surfaces under test:
 *
 *   1. `runManagedAgent` runner — happy + failure paths driven by a fake
 *      `ManagedAgentTransport`. Validates the stream-event protocol the
 *      runner expects from `client.beta.sessions.*`.
 *   2. `getManagedAgentBinding` env-var contract.
 */

const VALID_MIRROR_JSON = JSON.stringify({
  validation: 'You stayed long enough that the time disappeared.',
  inferred_meaning: 'Maybe the absorption mattered as much as the build.',
  story_reframe:
    'You sat down with the kit. You took it apart your way. The afternoon slipped past you.',
})

function makeFakeTransport(
  events: ManagedAgentRunnerEvent[],
  opts: { sessionId?: string; sendShouldThrow?: Error; capture?: { lastPrompt?: string } } = {},
): ManagedAgentTransport {
  const captured = opts.capture ?? {}
  return {
    async createSession() {
      return opts.sessionId ?? 'sesn_test_abc'
    },
    async sendUserMessage(_sid, text) {
      captured.lastPrompt = text
      if (opts.sendShouldThrow) throw opts.sendShouldThrow
    },
    streamEvents() {
      let i = 0
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i >= events.length) {
                return { value: undefined, done: true as const }
              }
              const value = events[i++] as ManagedAgentRunnerEvent
              return { value, done: false as const }
            },
          }
        },
      }
    },
  }
}

/**
 * Reproduces a genuinely hung upstream stream: `next()` never settles, and
 * `return()` — like a real async generator's — queues behind that pending
 * `next()`, so it never settles either. Before the runner owned an
 * AbortController and bounded its cleanup, the `finally`'s unbounded
 * `await iterator.return?.()` swallowed the TIMEOUT error and
 * `runManagedAgent` hung forever.
 */
function makeHangingTransport(): ManagedAgentTransport {
  return {
    async createSession() {
      return 'sesn_hang'
    },
    async sendUserMessage() {},
    streamEvents() {
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<ManagedAgentRunnerEvent>> {
              // Intentionally never resolves.
              return new Promise(() => {})
            },
            return(): Promise<IteratorResult<ManagedAgentRunnerEvent>> {
              // Queued behind the pending `next()`, so also never resolves.
              return new Promise(() => {})
            },
          }
        },
      }
    },
  }
}

describe('U6 runManagedAgent — happy path', () => {
  it('streams agent.message text, sums span.model_request_end usage, parses JSON against schema', async () => {
    const capture: { lastPrompt?: string } = {}
    const transport = makeFakeTransport(
      [
        { type: 'other', rawType: 'session.status_running' },
        {
          type: 'span.model_request_end',
          inputTokens: 1500,
          outputTokens: 0,
          cacheReadInputTokens: 800,
          cacheCreationInputTokens: 0,
        },
        { type: 'agent.message', text: VALID_MIRROR_JSON },
        {
          type: 'span.model_request_end',
          inputTokens: 0,
          outputTokens: 220,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
        { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
      ],
      { capture },
    )

    const result = await runManagedAgent({
      agentId: 'agt_mirror',
      agentVersion: 1,
      environmentId: 'env_sensemaking',
      prompt: 'Transcript: I had a hard day.',
      outputSchema: MirrorOutputSchema,
      transport,
    })

    expect(result.sessionId).toBe('sesn_test_abc')
    expect(MirrorOutputSchema.safeParse(result.output).success).toBe(true)
    expect(result.usage.inputTokens).toBe(1500)
    expect(result.usage.outputTokens).toBe(220)
    expect(result.usage.cacheReadInputTokens).toBe(800)
    expect(capture.lastPrompt).toContain('I had a hard day')
  })

  it('concatenates text from multiple agent.message events before parsing', async () => {
    const part1 = '{"validation":"v","inferred_meaning":"i",'
    const part2 = '"story_reframe":"s"}'
    const transport = makeFakeTransport([
      { type: 'agent.message', text: part1 },
      { type: 'agent.message', text: part2 },
      { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
    ])

    const result = await runManagedAgent({
      agentId: 'agt_mirror',
      environmentId: 'env_x',
      prompt: 'p',
      outputSchema: MirrorOutputSchema,
      transport,
    })
    expect(result.output.story_reframe).toBe('s')
  })

  it('strips ```json fences before JSON.parse', async () => {
    const transport = makeFakeTransport([
      { type: 'agent.message', text: `\`\`\`json\n${VALID_MIRROR_JSON}\n\`\`\`` },
      { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
    ])
    const result = await runManagedAgent({
      agentId: 'agt_mirror',
      environmentId: 'env_x',
      prompt: 'p',
      outputSchema: MirrorOutputSchema,
      transport,
    })
    expect(result.output.validation).toMatch(/stayed long enough/)
  })

  it('extracts JSON from wrapper text when the fence is not closed cleanly', async () => {
    const transport = makeFakeTransport([
      {
        type: 'agent.message',
        text: `\`\`\`json\n${VALID_MIRROR_JSON}\n\nI will stop here.`,
      },
      { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
    ])
    const result = await runManagedAgent({
      agentId: 'agt_mirror',
      environmentId: 'env_x',
      prompt: 'p',
      outputSchema: MirrorOutputSchema,
      transport,
    })
    expect(result.output.story_reframe).toContain('afternoon slipped')
  })
})

describe('U6 runManagedAgent — failure modes', () => {
  it('throws REQUIRES_ACTION when session.status_idle stop_reason is requires_action (Mirror has no tools)', async () => {
    const transport = makeFakeTransport([
      { type: 'agent.message', text: '{"partial":true}' },
      {
        type: 'session.status_idle',
        stopReason: 'requires_action',
        rawStopReason: 'requires_action',
      },
    ])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toMatchObject({ code: 'REQUIRES_ACTION' })
  })

  it('throws RETRIES_EXHAUSTED on retries_exhausted stop_reason', async () => {
    const transport = makeFakeTransport([
      {
        type: 'session.status_idle',
        stopReason: 'retries_exhausted',
        rawStopReason: 'retries_exhausted',
      },
    ])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toMatchObject({ code: 'RETRIES_EXHAUSTED' })
  })

  it('throws TERMINATED when session.status_terminated arrives before idle', async () => {
    const transport = makeFakeTransport([
      { type: 'agent.message', text: 'half ' },
      { type: 'session.status_terminated' },
    ])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toMatchObject({ code: 'TERMINATED' })
  })

  it('throws STREAM_ERROR on session.error with terminal retry_status', async () => {
    const transport = makeFakeTransport([
      { type: 'session.error', message: 'model rate limited', retryStatus: 'terminal' },
    ])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toMatchObject({ code: 'STREAM_ERROR' })
  })

  it("ignores session.error with retry_status='retrying' and keeps consuming the stream", async () => {
    const transport = makeFakeTransport([
      { type: 'session.error', message: 'transient', retryStatus: 'retrying' },
      { type: 'agent.message', text: VALID_MIRROR_JSON },
      { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
    ])
    const result = await runManagedAgent({
      agentId: 'agt_mirror',
      environmentId: 'env_x',
      prompt: 'p',
      outputSchema: MirrorOutputSchema,
      transport,
    })
    expect(MirrorOutputSchema.safeParse(result.output).success).toBe(true)
  })

  it('throws NO_OUTPUT when end_turn arrives with no agent.message text', async () => {
    const transport = makeFakeTransport([
      { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
    ])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toMatchObject({ code: 'NO_OUTPUT' })
  })

  it('throws PARSE_ERROR when text is not JSON', async () => {
    const transport = makeFakeTransport([
      { type: 'agent.message', text: 'I am thinking out loud, not JSON.' },
      { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
    ])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toMatchObject({ code: 'PARSE_ERROR' })
  })

  it('throws PARSE_ERROR when JSON is well-formed but fails schema validation', async () => {
    const transport = makeFakeTransport([
      {
        type: 'agent.message',
        text: '{"validation":"","inferred_meaning":"i","story_reframe":"s"}',
      },
      { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
    ])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toMatchObject({ code: 'PARSE_ERROR' })
  })

  it('runs without ANTHROPIC_API_KEY when a transport is injected (test seam)', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      const transport = makeFakeTransport([
        { type: 'agent.message', text: VALID_MIRROR_JSON },
        { type: 'session.status_idle', stopReason: 'end_turn', rawStopReason: 'end_turn' },
      ])
      const result = await runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      })
      expect(result.output.validation).toBeDefined()
    } finally {
      if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey
    }
  })

  it('surfaces ManagedAgentError instances on all failures (not generic Error)', async () => {
    const transport = makeFakeTransport([{ type: 'session.status_terminated' }])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toBeInstanceOf(ManagedAgentError)
  })
})

describe('U6 runManagedAgent — timeout is terminal', () => {
  // The 3s per-test timeout is comfortably above `timeoutMs` + the runner's
  // 1s cleanup bound, but well under Vitest's default — so a regression FAILS
  // here rather than hanging the suite.
  it('rejects with TIMEOUT even when the upstream stream never settles', {
    timeout: 3_000,
  }, async () => {
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport: makeHangingTransport(),
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
})

describe('translateSdkEvent — stop reasons are classified, never coerced to success', () => {
  it.each([
    ['end_turn', 'end_turn', 'end_turn'],
    ['requires_action', 'requires_action', 'requires_action'],
    ['retries_exhausted', 'retries_exhausted', 'retries_exhausted'],
    // A stop reason the SDK may add later must NOT read as a completed turn.
    ['max_tokens', 'unrecognised', 'max_tokens'],
  ])('stop_reason %s → stopReason %s (rawStopReason %s)', (raw, stopReason, rawStopReason) => {
    expect(translateSdkEvent({ type: 'session.status_idle', stop_reason: { type: raw } })).toEqual({
      type: 'session.status_idle',
      stopReason,
      rawStopReason,
    })
  })

  it('classifies a missing stop_reason as unrecognised, not end_turn', () => {
    expect(translateSdkEvent({ type: 'session.status_idle' })).toEqual({
      type: 'session.status_idle',
      stopReason: 'unrecognised',
      rawStopReason: 'missing',
    })
  })

  it('throws UNKNOWN_STOP_REASON rather than admitting a truncated turn as success', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const transport = makeFakeTransport([
      // Schema-valid text that arrived before an unrecognised idle. The old
      // coerce-to-end_turn path would have returned this as a real result.
      { type: 'agent.message', text: VALID_MIRROR_JSON },
      {
        type: 'session.status_idle',
        stopReason: 'unrecognised',
        rawStopReason: 'max_tokens',
      },
    ])
    await expect(
      runManagedAgent({
        agentId: 'agt_mirror',
        environmentId: 'env_x',
        prompt: 'p',
        outputSchema: MirrorOutputSchema,
        transport,
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_STOP_REASON' })
    // The raw value is the only signal telling ops to widen the union.
    expect(warnSpy).toHaveBeenCalledWith(
      '[managed-agent] unrecognised stop_reason',
      expect.objectContaining({ rawStopReason: 'max_tokens' }),
    )
    warnSpy.mockRestore()
  })
})

describe('getManagedAgentBinding', () => {
  const SAVED_ENV = { ...process.env }
  beforeEach(() => {
    delete process.env.MANAGED_AGENT_CONNECTOR_ID
    delete process.env.MANAGED_AGENT_CONNECTOR_VERSION
    delete process.env.MANAGED_AGENT_ENV_ID
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in SAVED_ENV)) delete process.env[k]
    }
    for (const [k, v] of Object.entries(SAVED_ENV)) {
      if (v !== undefined) process.env[k] = v
    }
  })

  it('reads MANAGED_AGENT_<NAME>_ID + _VERSION + MANAGED_AGENT_ENV_ID', async () => {
    process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
    process.env.MANAGED_AGENT_CONNECTOR_VERSION = '3'
    process.env.MANAGED_AGENT_ENV_ID = 'env_xyz'
    const { getManagedAgentBinding } = await import('~/agents/config')
    expect(getManagedAgentBinding('connector')).toEqual({
      agentId: 'agt_connector_abc',
      agentVersion: 3,
      environmentId: 'env_xyz',
    })
  })

  it('agentVersion is undefined when MANAGED_AGENT_<NAME>_VERSION is unset (pins to latest server-side)', async () => {
    process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_xyz'
    const { getManagedAgentBinding } = await import('~/agents/config')
    const b = getManagedAgentBinding('connector')
    expect(b.agentVersion).toBeUndefined()
  })

  it('throws when MANAGED_AGENT_<NAME>_ID is missing', async () => {
    process.env.MANAGED_AGENT_ENV_ID = 'env_xyz'
    const { getManagedAgentBinding } = await import('~/agents/config')
    expect(() => getManagedAgentBinding('connector')).toThrow(/MANAGED_AGENT_CONNECTOR_ID/)
  })

  it('throws when MANAGED_AGENT_ENV_ID is missing', async () => {
    process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
    const { getManagedAgentBinding } = await import('~/agents/config')
    expect(() => getManagedAgentBinding('connector')).toThrow(/MANAGED_AGENT_ENV_ID/)
  })
})
