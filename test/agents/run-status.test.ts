import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  finishAgentRun,
  getAgentDebugSnapshot,
  resetAgentDebugForTests,
  startAgentRun,
  subscribeAgentDebug,
} from '~/agents/run-status'

afterEach(() => {
  resetAgentDebugForTests()
  vi.restoreAllMocks()
})

describe('agent run debug store', () => {
  it('tracks currently running agents and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAgentDebug(listener)

    startAgentRun('connector', 'Checking library updates.')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getAgentDebugSnapshot().runningCount).toBe(1)
    expect(getAgentDebugSnapshot().runs.find((run) => run.name === 'connector')).toMatchObject({
      status: 'running',
      detail: 'Checking library updates.',
    })

    finishAgentRun('connector', 'succeeded', 'Connector linked verified dots.')

    expect(listener).toHaveBeenCalledTimes(2)
    expect(getAgentDebugSnapshot().runningCount).toBe(0)
    expect(getAgentDebugSnapshot().runs.find((run) => run.name === 'connector')).toMatchObject({
      status: 'succeeded',
      detail: 'Connector linked verified dots.',
    })

    unsubscribe()
  })
})
