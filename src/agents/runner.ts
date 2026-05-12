/**
 * Managed Agents runtime wrapper — Step 6 of
 * `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
 *
 * Thin async-iterable transport over `client.beta.sessions.*` that turns a
 * one-shot agent invocation (Mirror today; Connector + Cartographer wire up
 * in Steps 8/9) into `prompt → JSON → schema.parse`.
 *
 * The boundary between this file and call sites is intentional:
 *   - Call sites do NOT know about session ids, event streams, or token
 *     accounting. They pass a prompt + an output schema and get back a
 *     parsed value plus diagnostics.
 *   - The Anthropic SDK boundary is `ManagedAgentTransport`. Tests inject a
 *     fake transport; production wraps a real `Anthropic` client.
 *
 * Beta header (`managed-agents-2026-04-01`) is applied per-call by the SDK
 * resource methods (see node_modules/@anthropic-ai/sdk/.../sessions/events.mjs).
 * The default transport does NOT need to set it explicitly.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'

const DEFAULT_TIMEOUT_MS = 120_000

/**
 * Normalized event shape consumed by `runManagedAgent`. Mirrors the subset of
 * `BetaManagedAgentsStreamSessionEvents` we actually act on. Adding new
 * event types (tool use, multiagent thread events) means extending this
 * union AND its translation in `anthropicSessionEventToRunnerEvent`.
 */
export type ManagedAgentRunnerEvent =
  | { type: 'agent.message'; text: string }
  | {
      type: 'session.status_idle'
      stopReason: 'end_turn' | 'requires_action' | 'retries_exhausted'
    }
  | { type: 'session.status_terminated' }
  | { type: 'session.error'; message: string; retryStatus: 'retrying' | 'exhausted' | 'terminal' }
  | {
      type: 'span.model_request_end'
      inputTokens: number
      outputTokens: number
      cacheReadInputTokens: number
      cacheCreationInputTokens: number
    }
  | { type: 'other'; rawType: string }

export interface ManagedAgentTransport {
  /**
   * Create a session bound to the agent (optionally pinned to a version)
   * and environment. Returns the session id.
   *
   * `memoryStoreId` (when supplied) attaches the per-student memory store
   * as a `resources[]` entry so the agent can read its prior `student-voice.md`,
   * `pedagogical-state.md`, etc. at `/mnt/memory/`. Step 10 of the migration
   * resolves this id via `getOrCreateMemoryStoreId(studentId)` before
   * dispatching the agent.
   */
  createSession(params: {
    agentId: string
    agentVersion?: number
    environmentId: string
    title?: string
    memoryStoreId?: string
  }): Promise<string>

  /** Push a single user text message into an existing session. */
  sendUserMessage(sessionId: string, text: string): Promise<void>

  /** Async-iterable stream of normalized events for an existing session. */
  streamEvents(
    sessionId: string,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ManagedAgentRunnerEvent>
}

export class ManagedAgentError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NO_API_KEY'
      | 'NO_OUTPUT'
      | 'PARSE_ERROR'
      | 'TERMINATED'
      | 'STREAM_ERROR'
      | 'TIMEOUT'
      | 'REQUIRES_ACTION'
      | 'RETRIES_EXHAUSTED',
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ManagedAgentError'
  }
}

export interface ManagedAgentUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export interface RunManagedAgentResult<T> {
  output: T
  sessionId: string
  rawText: string
  usage: ManagedAgentUsage
}

export interface RunManagedAgentOptions<T> {
  /** Agent id from `MANAGED_AGENT_<name>_ID`. */
  agentId: string
  /** Agent version from `MANAGED_AGENT_<name>_VERSION`. Pins drift across re-provisions. */
  agentVersion?: number
  /** Environment id from `MANAGED_AGENT_ENV_ID`. */
  environmentId: string
  /** One-shot user prompt. The agent's system prompt is configured at provision time. */
  prompt: string
  /** Zod schema the assistant's text output is parsed against. */
  outputSchema: z.ZodType<T>
  /** Optional human-readable session title (audit-friendly). */
  sessionTitle?: string
  /**
   * Optional Anthropic memory store id (`memstore_...`). Attached as a
   * `read_write` resource so the agent can read prior memory files at
   * `/mnt/memory/` and write back during its turn. Memory file writes
   * the SERVER initiates go through `appendStudentMemory` (Step 10) and
   * do NOT depend on this binding — but the agent reading them does.
   */
  memoryStoreId?: string
  /** Override the SDK transport. Default: build from `process.env.ANTHROPIC_API_KEY`. */
  transport?: ManagedAgentTransport
  /** Cancellation signal forwarded to the event stream. */
  signal?: AbortSignal
  /** Hard timeout. Default 120s. */
  timeoutMs?: number
}

/**
 * Strip optional ```json ... ``` fences a model might wrap the JSON in.
 * Mirrors `unwrapJsonFence` in `src/agents/tools/self-critique.ts`.
 */
function unwrapJsonFence(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) {
    const withoutOpen = trimmed.replace(/^```(?:json)?\s*/, '')
    return withoutOpen.replace(/\s*```\s*$/, '').trim()
  }
  return trimmed
}

let cachedAnthropic: Anthropic | undefined

function getAnthropicClient(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new ManagedAgentError(
      'Managed Agents runner: ANTHROPIC_API_KEY is not set. Required for `client.beta.sessions.*`.',
      'NO_API_KEY',
    )
  }
  cachedAnthropic = new Anthropic({ apiKey })
  return cachedAnthropic
}

/** Drop the cached SDK client. Tests reset env between cases; production never calls this. */
export function resetManagedAgentClientCacheForTests(): void {
  cachedAnthropic = undefined
}

/**
 * Default transport wrapping the live `Anthropic.beta.sessions.*` surface.
 * Lazy-constructs the SDK client on first use so module load does not
 * require `ANTHROPIC_API_KEY` in environments that never call the runner
 * (e.g. SQLite-only unit tests). Tests inject a fake transport via
 * `RunManagedAgentOptions.transport`.
 */
export function createAnthropicManagedTransport(client?: Anthropic): ManagedAgentTransport {
  const resolveClient = () => client ?? getAnthropicClient()
  return {
    async createSession({ agentId, agentVersion, environmentId, title, memoryStoreId }) {
      const agent =
        agentVersion === undefined
          ? agentId
          : { id: agentId, type: 'agent' as const, version: agentVersion }
      const session = await resolveClient().beta.sessions.create({
        agent,
        environment_id: environmentId,
        ...(title !== undefined ? { title } : {}),
        ...(memoryStoreId !== undefined
          ? {
              resources: [
                {
                  type: 'memory_store' as const,
                  memory_store_id: memoryStoreId,
                  access: 'read_write' as const,
                },
              ],
            }
          : {}),
      })
      return session.id
    },
    async sendUserMessage(sessionId, text) {
      await resolveClient().beta.sessions.events.send(sessionId, {
        events: [
          {
            type: 'user.message',
            content: [{ type: 'text', text }],
          },
        ],
      })
    },
    streamEvents(sessionId, options) {
      const c = resolveClient()
      return {
        [Symbol.asyncIterator]() {
          let iterator: AsyncIterator<ManagedAgentRunnerEvent> | undefined
          return {
            async next() {
              if (!iterator) {
                const stream = await c.beta.sessions.events.stream(sessionId, undefined, {
                  ...(options?.signal ? { signal: options.signal } : {}),
                })
                // The SDK's typed event union doesn't index by string, but
                // each variant is a plain JSON object at runtime — cast at
                // the boundary so `translateSdkEvent` can read fields by name.
                const source = stream as unknown as AsyncIterable<
                  { type?: string } & Record<string, unknown>
                >
                iterator = mapSdkEventStream(source)[Symbol.asyncIterator]()
              }
              return iterator.next()
            },
            async return() {
              await iterator?.return?.()
              return { value: undefined, done: true as const }
            },
          }
        },
      }
    },
  }
}

/**
 * Translate the SDK's union event stream into the narrower
 * `ManagedAgentRunnerEvent` shape the runner consumes. Unknown event types
 * surface as `{ type: 'other' }` so future SDK additions don't crash.
 */
async function* mapSdkEventStream(
  source: AsyncIterable<{ type?: string } & Record<string, unknown>>,
): AsyncIterable<ManagedAgentRunnerEvent> {
  for await (const raw of source) {
    yield translateSdkEvent(raw)
  }
}

function translateSdkEvent(
  raw: { type?: string } & Record<string, unknown>,
): ManagedAgentRunnerEvent {
  const t = raw.type
  if (t === 'agent.message') {
    const content = raw.content as Array<{ type: string; text?: string }> | undefined
    const text = (content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
    return { type: 'agent.message', text }
  }
  if (t === 'session.status_idle') {
    const stop = raw.stop_reason as { type: string } | undefined
    const stopReason =
      stop?.type === 'end_turn' ||
      stop?.type === 'requires_action' ||
      stop?.type === 'retries_exhausted'
        ? stop.type
        : 'end_turn'
    return { type: 'session.status_idle', stopReason }
  }
  if (t === 'session.status_terminated') {
    return { type: 'session.status_terminated' }
  }
  if (t === 'session.error') {
    const err = raw.error as { message?: string; retry_status?: { type?: string } } | undefined
    const rs = err?.retry_status?.type
    const retryStatus =
      rs === 'retrying' || rs === 'exhausted' || rs === 'terminal' ? rs : 'terminal'
    return { type: 'session.error', message: err?.message ?? 'unknown session error', retryStatus }
  }
  if (t === 'span.model_request_end') {
    const u = raw.model_usage as
      | {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
      | undefined
    return {
      type: 'span.model_request_end',
      inputTokens: u?.input_tokens ?? 0,
      outputTokens: u?.output_tokens ?? 0,
      cacheReadInputTokens: u?.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: u?.cache_creation_input_tokens ?? 0,
    }
  }
  return { type: 'other', rawType: typeof t === 'string' ? t : 'unknown' }
}

/**
 * Run a one-shot Managed Agents call: create a session, send `prompt` as a
 * user message, drain the event stream until the agent reaches an
 * `end_turn` idle, concatenate every `agent.message` text block, parse JSON,
 * and validate against `outputSchema`.
 *
 * Failure modes (all surface as `ManagedAgentError`):
 *   - NO_API_KEY:        `ANTHROPIC_API_KEY` is unset and no transport is injected.
 *   - TERMINATED:        session entered `session.status_terminated` before idle.
 *   - REQUIRES_ACTION:   the agent paused on a tool call. Mirror has no tools;
 *                        Connector/Cartographer (Steps 8/9) will need a tool loop.
 *   - RETRIES_EXHAUSTED: the agent hit `max_iterations` or an unrecoverable error.
 *   - NO_OUTPUT:         stream ended with idle but produced no agent.message text.
 *   - PARSE_ERROR:       text was not valid JSON, or failed schema validation.
 *   - STREAM_ERROR:      surfaced `session.error` with `retry_status: terminal`.
 *   - TIMEOUT:           total elapsed exceeded `timeoutMs`.
 */
export async function runManagedAgent<T>(
  opts: RunManagedAgentOptions<T>,
): Promise<RunManagedAgentResult<T>> {
  const transport = opts.transport ?? createAnthropicManagedTransport()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const sessionId = await transport.createSession({
    agentId: opts.agentId,
    ...(opts.agentVersion !== undefined ? { agentVersion: opts.agentVersion } : {}),
    environmentId: opts.environmentId,
    ...(opts.sessionTitle !== undefined ? { title: opts.sessionTitle } : {}),
    ...(opts.memoryStoreId !== undefined ? { memoryStoreId: opts.memoryStoreId } : {}),
  })

  // Open the event stream before sending input so we don't miss the first
  // `session.status_running` or `agent.message` event the server emits in
  // response to the user message.
  const streamIterable = transport.streamEvents(
    sessionId,
    opts.signal ? { signal: opts.signal } : undefined,
  )
  await transport.sendUserMessage(sessionId, opts.prompt)

  const usage: ManagedAgentUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
  let collectedText = ''

  const iterator = streamIterable[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs

  try {
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new ManagedAgentError(
          `Managed Agents runner: session ${sessionId} did not complete within ${timeoutMs}ms.`,
          'TIMEOUT',
        )
      }
      const event = await raceWithTimeout(iterator.next(), remaining, sessionId)
      if (event.done) break
      const value = event.value

      if (value.type === 'agent.message') {
        collectedText += value.text
      } else if (value.type === 'span.model_request_end') {
        usage.inputTokens += value.inputTokens
        usage.outputTokens += value.outputTokens
        usage.cacheReadInputTokens += value.cacheReadInputTokens
        usage.cacheCreationInputTokens += value.cacheCreationInputTokens
      } else if (value.type === 'session.status_idle') {
        if (value.stopReason === 'end_turn') break
        if (value.stopReason === 'requires_action') {
          throw new ManagedAgentError(
            `Managed Agents runner: session ${sessionId} paused on requires_action — Mirror's agent has no tools, so this signals a provisioning or prompt regression.`,
            'REQUIRES_ACTION',
          )
        }
        throw new ManagedAgentError(
          `Managed Agents runner: session ${sessionId} exhausted retries before producing a final answer.`,
          'RETRIES_EXHAUSTED',
        )
      } else if (value.type === 'session.error') {
        if (value.retryStatus === 'terminal' || value.retryStatus === 'exhausted') {
          throw new ManagedAgentError(
            `Managed Agents runner: session ${sessionId} error (${value.retryStatus}): ${value.message}`,
            'STREAM_ERROR',
          )
        }
        // 'retrying' is informational — the server will retry; keep consuming.
      } else if (value.type === 'session.status_terminated') {
        throw new ManagedAgentError(
          `Managed Agents runner: session ${sessionId} terminated before reaching end_turn.`,
          'TERMINATED',
        )
      }
      // 'other' events (status_running, thinking, span.model_request_start, etc.) are no-ops here.
    }
  } finally {
    await iterator.return?.()
  }

  if (collectedText.trim().length === 0) {
    throw new ManagedAgentError(
      `Managed Agents runner: session ${sessionId} reached end_turn but produced no agent.message text.`,
      'NO_OUTPUT',
    )
  }

  const unwrapped = unwrapJsonFence(collectedText)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(unwrapped)
  } catch (err) {
    throw new ManagedAgentError(
      `Managed Agents runner: session ${sessionId} produced non-JSON output. First 200 chars: ${collectedText.slice(0, 200)}`,
      'PARSE_ERROR',
      err,
    )
  }
  const parsed = opts.outputSchema.safeParse(parsedJson)
  if (!parsed.success) {
    throw new ManagedAgentError(
      `Managed Agents runner: session ${sessionId} output failed schema validation: ${parsed.error.message}`,
      'PARSE_ERROR',
      parsed.error,
    )
  }

  return {
    output: parsed.data,
    sessionId,
    rawText: collectedText,
    usage,
  }
}

function raceWithTimeout<T>(p: Promise<T>, ms: number, sessionId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(
        new ManagedAgentError(
          `Managed Agents runner: session ${sessionId} timed out waiting for next event (>${ms}ms).`,
          'TIMEOUT',
        ),
      )
    }, ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (err: unknown) => {
        clearTimeout(t)
        reject(err)
      },
    )
  })
}
