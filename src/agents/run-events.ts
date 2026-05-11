/**
 * Discriminated union of step-level events emitted by the streamed
 * Connector → Cartographer sense-making chain. Server captures these as the
 * underlying SDK Runner events arrive; the UI consumes them via the
 * `run-sensemaking` server fn and animates them into the live agent
 * visualization (U6).
 *
 * Step-level on purpose (R12). Token-level streaming would be too noisy
 * at demo distance; agent + tool transitions are legible and meaningful.
 *
 * v0.2 rename note: `'pathfinder'` was renamed to `'cartographer'` in U10.
 * The union is now `'connector' | 'cartographer'`; legacy `'pathfinder'`
 * agent-event payloads are no longer emitted by the chain orchestrators.
 */

export type AgentName = 'connector' | 'cartographer'

export type RunStepEvent =
  | { type: 'agent_started'; agent: AgentName; timestampMs: number }
  | {
      type: 'tool_call_started'
      agent: AgentName
      toolName: string
      argsPreview: string
      timestampMs: number
    }
  | {
      type: 'tool_call_completed'
      agent: AgentName
      toolName: string
      resultPreview: string
      timestampMs: number
    }
  | { type: 'message_output'; agent: AgentName; preview: string; timestampMs: number }
  | { type: 'reasoning'; agent: AgentName; timestampMs: number }
  | { type: 'handoff'; from: AgentName; to: AgentName; timestampMs: number }
  | {
      type: 'agent_completed'
      agent: AgentName
      outputPreview: string
      timestampMs: number
    }
  | {
      type: 'run_completed'
      connectorOutputId: number
      pathfinderOutputId: number | null
      partial: boolean
      timestampMs: number
    }
  | { type: 'error'; agent: AgentName | 'chain'; message: string; timestampMs: number }

/** Distributive Omit so Omit<T, K> works correctly across discriminated unions. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** A step event without its timestamp — what handlers emit. The wrapper stamps it. */
export type RunStepEventInput = DistributiveOmit<RunStepEvent, 'timestampMs'>

export interface RunSensemakingResult {
  events: RunStepEvent[]
  /** Total wall-clock duration of the run in ms — useful for UI playback timing. */
  totalDurationMs: number
  connectorOutputId: number | null
  pathfinderOutputId: number | null
  partial: boolean
}

/** Truncate a long string for inline previews in the UI. */
export function truncate(s: string, max = 120): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}
