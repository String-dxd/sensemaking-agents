import { describe, expect, it } from 'vitest'

// @ts-expect-error — engine source is JavaScript without companion declarations.
const performanceModule = await import('~/engine/student-space/Game/State/Performance.js')

const PerformanceState = performanceModule.default
const { selectInitialPerformanceTier, selectPixelRatio } = performanceModule

function feedFrames(
  state: { update(frameSeconds: number): unknown },
  frameSeconds: number,
  count: number,
) {
  for (let i = 0; i < count; i++) state.update(frameSeconds)
}

describe('Student Space performance quality state', () => {
  it('chooses an initial tier from device hints', () => {
    expect(
      selectInitialPerformanceTier({
        devicePixelRatio: 1,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        width: 1440,
        height: 900,
      }),
    ).toBe('high')

    expect(
      selectInitialPerformanceTier({
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        width: 1440,
        height: 900,
      }),
    ).toBe('medium')

    expect(
      selectInitialPerformanceTier({
        devicePixelRatio: 3,
        hardwareConcurrency: 2,
        deviceMemory: 2,
        width: 390,
        height: 844,
      }),
    ).toBe('low')
  })

  it('demotes after sustained slow frames', () => {
    const perf = new PerformanceState({ tier: 'high' })

    feedFrames(perf, 24 / 1000, 100)

    expect(perf.tier).toBe('medium')
    expect(perf.revision).toBe(1)
  })

  it('promotes after sustained fast frames', () => {
    const perf = new PerformanceState({ tier: 'low' })

    feedFrames(perf, 14 / 1000, 260)
    expect(perf.tier).toBe('medium')

    feedFrames(perf, 14 / 1000, 260)
    expect(perf.tier).toBe('high')
  })

  it('does not oscillate inside the hysteresis band', () => {
    const perf = new PerformanceState({ tier: 'high' })

    feedFrames(perf, 24 / 1000, 100)
    expect(perf.tier).toBe('medium')
    const revisionAfterDemotion = perf.revision

    feedFrames(perf, 17 / 1000, 500)

    expect(perf.tier).toBe('medium')
    expect(perf.revision).toBe(revisionAfterDemotion)
  })

  it('selects DPR caps by quality tier', () => {
    expect(selectPixelRatio(3, 'high')).toBe(2)
    expect(selectPixelRatio(3, 'medium')).toBe(1.5)
    expect(selectPixelRatio(3, 'low')).toBe(1)
    expect(selectPixelRatio(1.25, 'high')).toBe(1.25)
  })
})
