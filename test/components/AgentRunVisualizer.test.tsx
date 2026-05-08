import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RunStepEvent } from '~/agents/run-events'
import { AgentRunVisualizer } from '~/components/AgentRunVisualizer'

function ev<E extends RunStepEvent>(e: E): E {
  return e
}

describe('AgentRunVisualizer', () => {
  it('renders both agent cards even before any events stream in', () => {
    render(<AgentRunVisualizer events={[]} animate={false} />)
    expect(screen.getByTestId('agent-card-connector')).toBeInTheDocument()
    expect(screen.getByTestId('agent-card-pathfinder')).toBeInTheDocument()
    // Both queued initially.
    expect(screen.getByTestId('agent-card-connector')).toHaveAttribute('data-active', 'false')
    expect(screen.getByTestId('agent-card-pathfinder')).toHaveAttribute('data-active', 'false')
  })

  it('marks Connector active while only its events have arrived', () => {
    const events: RunStepEvent[] = [
      ev({ type: 'agent_started', agent: 'connector', timestampMs: 0 }),
      ev({
        type: 'tool_call_started',
        agent: 'connector',
        toolName: 'search_past_mirrors',
        argsPreview: '{"query":"robotics"}',
        timestampMs: 200,
      }),
    ]
    render(<AgentRunVisualizer events={events} animate={false} />)
    expect(screen.getByTestId('agent-card-connector')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('agent-card-pathfinder')).toHaveAttribute('data-active', 'false')
    // Tool name + args preview surfaced.
    expect(screen.getByText('search_past_mirrors')).toBeInTheDocument()
  })

  it('shows the explicit handoff transition once the chain hands off', () => {
    const events: RunStepEvent[] = [
      ev({ type: 'agent_started', agent: 'connector', timestampMs: 0 }),
      ev({
        type: 'agent_completed',
        agent: 'connector',
        outputPreview: 'patterns',
        timestampMs: 400,
      }),
      ev({ type: 'handoff', from: 'connector', to: 'pathfinder', timestampMs: 410 }),
      ev({ type: 'agent_started', agent: 'pathfinder', timestampMs: 420 }),
    ]
    render(<AgentRunVisualizer events={events} animate={false} />)
    expect(screen.getByTestId('handoff-transition')).toBeInTheDocument()
    expect(screen.getByTestId('agent-card-pathfinder')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('agent-card-connector')).toHaveAttribute('data-active', 'false')
  })

  it('renders a final completion line after run_completed', () => {
    const events: RunStepEvent[] = [
      ev({ type: 'agent_started', agent: 'connector', timestampMs: 0 }),
      ev({
        type: 'agent_completed',
        agent: 'connector',
        outputPreview: 'p',
        timestampMs: 100,
      }),
      ev({ type: 'handoff', from: 'connector', to: 'pathfinder', timestampMs: 105 }),
      ev({ type: 'agent_started', agent: 'pathfinder', timestampMs: 110 }),
      ev({
        type: 'agent_completed',
        agent: 'pathfinder',
        outputPreview: 't',
        timestampMs: 200,
      }),
      ev({
        type: 'run_completed',
        connectorOutputId: 1,
        pathfinderOutputId: 2,
        partial: false,
        timestampMs: 210,
      }),
    ]
    render(<AgentRunVisualizer events={events} animate={false} />)
    expect(screen.getByText(/run complete/i)).toBeInTheDocument()
  })

  it('surfaces an error message inline when an error event is present', () => {
    const events: RunStepEvent[] = [
      ev({ type: 'agent_started', agent: 'connector', timestampMs: 0 }),
      ev({
        type: 'error',
        agent: 'connector',
        message: 'rate-limited',
        timestampMs: 50,
      }),
    ]
    render(<AgentRunVisualizer events={events} animate={false} />)
    const alerts = screen.getAllByRole('alert')
    expect(alerts.some((el) => /rate-limited/i.test(el.textContent ?? ''))).toBe(true)
  })
})
