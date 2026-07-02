import { beforeEach, describe, expect, it } from 'vitest'
import { clearFrameLoop, registerUpdate, runFrame } from '../../src/core/motion/frameLoop'

describe('frameLoop phase ordering', () => {
  beforeEach(() => {
    clearFrameLoop()
  })

  it('runs phases in fixed order (animation, physics, procedural, render) regardless of registration order', () => {
    const callOrder: string[] = []

    // Register out of order: physics first, then animation, then render, then procedural.
    registerUpdate('physics', () => callOrder.push('physics'))
    registerUpdate('animation', () => callOrder.push('animation'))
    registerUpdate('render', () => callOrder.push('render'))
    registerUpdate('procedural', () => callOrder.push('procedural'))

    runFrame(1 / 60)

    expect(callOrder).toEqual(['animation', 'physics', 'procedural', 'render'])
  })

  it('a later-registered animation callback still runs before an earlier-registered physics callback', () => {
    const callOrder: string[] = []

    registerUpdate('physics', () => callOrder.push('physics-first-registered'))
    registerUpdate('animation', () => callOrder.push('animation-second-registered'))

    runFrame(1 / 60)

    expect(callOrder).toEqual(['animation-second-registered', 'physics-first-registered'])
  })

  it('passes dt through to registered callbacks', () => {
    let received = -1
    registerUpdate('animation', (dt) => {
      received = dt
    })

    runFrame(0.016)

    expect(received).toBe(0.016)
  })
})
