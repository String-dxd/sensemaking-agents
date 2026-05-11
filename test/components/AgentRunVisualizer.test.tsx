import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RunStepEvent } from '~/agents/run-events'
import { AgentRunVisualizer } from '~/components/AgentRunVisualizer'

function ev<E extends RunStepEvent>(e: E): E {
  return e
}

describe('AgentRunVisualizer (v0.2 single-card Cartographer layout)', () => {
  it('renders the Cartographer card even before any events stream in', () => {
    render(<AgentRunVisualizer events={[]} animate={false} />)
    expect(screen.getByTestId('agent-card-cartographer')).toBeInTheDocument()
    // No Connector card in v0.2 — that visualization moved out in U7's
    // auto-Connector flow.
    expect(screen.queryByTestId('agent-card-connector')).not.toBeInTheDocument()
    // Queued initially.
    expect(screen.getByTestId('agent-card-cartographer')).toHaveAttribute('data-active', 'false')
  })

  it('marks Cartographer active once its agent_started event arrives', () => {
    const events: RunStepEvent[] = [
      ev({ type: 'agent_started', agent: 'cartographer', timestampMs: 0 }),
      ev({
        type: 'tool_call_started',
        agent: 'cartographer',
        toolName: 'lookup_ecg_taxonomy',
        argsPreview: '{"query":"engineering"}',
        timestampMs: 200,
      }),
    ]
    render(<AgentRunVisualizer events={events} animate={false} />)
    expect(screen.getByTestId('agent-card-cartographer')).toHaveAttribute('data-active', 'true')
    // Tool name + args preview surfaced.
    expect(screen.getByText('lookup_ecg_taxonomy')).toBeInTheDocument()
  })

  it('does not render a handoff transition pill in the single-card layout', () => {
    // v0.1 rendered a "↳ handoff to pathfinder" row between Connector and
    // Pathfinder cards. v0.2's single-card view omits it entirely.
    const events: RunStepEvent[] = [
      ev({ type: 'agent_started', agent: 'connector', timestampMs: 0 }),
      ev({
        type: 'agent_completed',
        agent: 'connector',
        outputPreview: 'patterns',
        timestampMs: 400,
      }),
      ev({ type: 'handoff', from: 'connector', to: 'cartographer', timestampMs: 410 }),
      ev({ type: 'agent_started', agent: 'cartographer', timestampMs: 420 }),
    ]
    render(<AgentRunVisualizer events={events} animate={false} />)
    expect(screen.queryByTestId('handoff-transition')).not.toBeInTheDocument()
    expect(screen.getByTestId('agent-card-cartographer')).toHaveAttribute('data-active', 'true')
  })

  it('renders a final completion line after run_completed', () => {
    const events: RunStepEvent[] = [
      ev({ type: 'agent_started', agent: 'cartographer', timestampMs: 0 }),
      ev({
        type: 'agent_completed',
        agent: 'cartographer',
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
      ev({ type: 'agent_started', agent: 'cartographer', timestampMs: 0 }),
      ev({
        type: 'error',
        agent: 'cartographer',
        message: 'rate-limited',
        timestampMs: 50,
      }),
    ]
    render(<AgentRunVisualizer events={events} animate={false} />)
    const alerts = screen.getAllByRole('alert')
    expect(alerts.some((el) => /rate-limited/i.test(el.textContent ?? ''))).toBe(true)
  })
})
