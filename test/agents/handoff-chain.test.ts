import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runSenseMakingForStudent } from '~/agents/handoff-chain'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { latestConnectorOutput, latestPathfinderOutput } from '~/db/queries'
import { seed } from '~/db/seed'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})

afterEach(() => {
  resetDbForTests()
})

describe('AE3: Connector → Handoff → Cartographer in one sense-making pass', () => {
  it('Cartographer receives Connector patterns as input context and emits trajectory + pathways', async () => {
    const runConnector = vi.fn().mockResolvedValue({
      patterns: [
        {
          text: 'Sustained absorption recurs in hands-on assembly tasks.',
          strength: 'medium',
          evidence_reflection_ids: [1, 6],
        },
        {
          text: 'Geometric reasoning fails where algebra succeeds.',
          strength: 'low',
          evidence_reflection_ids: [2],
        },
      ],
      still_unclear: 'Whether spatial reasoning generalizes outside mechanical assembly.',
    })
    const runCartographer = vi.fn(async ({ connector }) => {
      // The handoff edge is what we are asserting — Cartographer's input must
      // include Connector's patterns.
      expect(connector.patterns.length).toBe(2)
      expect(connector.patterns[0].evidence_reflection_ids).toEqual([1, 6])
      return {
        trajectory: 'A drift toward applied, hands-on engineering with humanities ajar.',
        pathways: [
          {
            label: 'Mechatronics-leaning engineering',
            reasoning: 'Reflections #1 and #6 cluster around hands-on assembly; #7 reinforces it.',
            ecg_taxonomy_ids: ['cluster.engineering', 'pathway.uni-sutd'],
          },
          {
            label: 'Mixed JC subject combination keeping Lit at H2',
            reasoning: 'Reflections #3, #5, and #8 surface sustained engagement in argument.',
            ecg_taxonomy_ids: ['subject.h2-bio-art'],
          },
        ],
        disclaimer: 'These are paths the pattern points toward, not careers to choose.',
      }
    })

    const result = await runSenseMakingForStudent('demo', { runConnector, runCartographer })

    expect(runConnector).toHaveBeenCalledOnce()
    expect(runCartographer).toHaveBeenCalledOnce()
    expect(result.partial).toBe(false)

    const connector = latestConnectorOutput('demo')
    const pathfinder = latestPathfinderOutput('demo')
    expect(connector?.id).toBe(result.connector.id)
    expect(pathfinder?.id).toBe(result.pathfinder?.id)
    expect(pathfinder?.connector_output_id).toBe(connector?.id)
  })

  it('rejects Connector output that omits evidence_reflection_ids — Zod gates uncited patterns', async () => {
    const runConnector = vi.fn().mockResolvedValue({
      patterns: [
        {
          text: 'Some unsupported pattern.',
          strength: 'high',
          evidence_reflection_ids: [], // empty — schema requires min(1)
        },
      ],
      still_unclear: null,
    })
    const runCartographer = vi.fn()

    await expect(
      runSenseMakingForStudent('demo', { runConnector, runCartographer }),
    ).rejects.toThrow()
    expect(runCartographer).not.toHaveBeenCalled()
  })

  it('reports partial success when Cartographer fails — Connector output is still persisted', async () => {
    const runConnector = vi.fn().mockResolvedValue({
      patterns: [
        {
          text: 'A solid pattern with evidence.',
          strength: 'medium',
          evidence_reflection_ids: [1, 6],
        },
      ],
      still_unclear: null,
    })
    const runCartographer = vi.fn().mockRejectedValue(new Error('rate-limited'))

    const result = await runSenseMakingForStudent('demo', { runConnector, runCartographer })

    expect(result.partial).toBe(true)
    expect(result.connector.id).toBeGreaterThan(0)
    expect(result.pathfinder).toBeNull()
    expect(latestConnectorOutput('demo')?.id).toBe(result.connector.id)
    expect(latestPathfinderOutput('demo')).toBeNull()
  })

  it('rejects Cartographer output with fewer than 2 pathways — schema enforces 2-5 range', async () => {
    const runConnector = vi.fn().mockResolvedValue({
      patterns: [
        {
          text: 'Fine pattern.',
          strength: 'medium',
          evidence_reflection_ids: [1],
        },
      ],
      still_unclear: null,
    })
    const runCartographer = vi.fn().mockResolvedValue({
      trajectory: 'A direction.',
      pathways: [
        {
          label: 'Only one',
          reasoning: 'Just this.',
          ecg_taxonomy_ids: ['cluster.engineering'],
        },
      ], // schema requires min(2)
      disclaimer: 'Only one is dishonest.',
    })

    const result = await runSenseMakingForStudent('demo', { runConnector, runCartographer })

    // Connector persisted, Cartographer failed validation → partial.
    expect(result.partial).toBe(true)
    expect(result.pathfinder).toBeNull()
  })
})
