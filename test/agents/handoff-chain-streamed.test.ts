// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runSensemakingStreamed } from '~/agents/handoff-chain-streamed'
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

describe.skipIf(!process.env.DATABASE_URL)('runSensemakingStreamed', () => {
  it('captures step events in order: connector_started → handoff → cartographer_started → run_completed', async () => {
    const result = await runSensemakingStreamed('demo', {
      runConnector: async ({ emit }) => {
        emit({
          type: 'tool_call_started',
          agent: 'connector',
          toolName: 'search_past_mirrors',
          argsPreview: '{"query":"robotics"}',
        })
        emit({
          type: 'tool_call_completed',
          agent: 'connector',
          toolName: 'search_past_mirrors',
          resultPreview: '[{"id":1,"story_reframe":"…"}]',
        })
        return {
          patterns: [
            {
              text: 'Spatial-positional reasoning recurs across hands-on assembly.',
              strength: 'medium',
              evidence_reflection_ids: [1, 6],
            },
          ],
          still_unclear: 'Whether spatial reasoning generalizes outside assembly.',
        }
      },
      runCartographer: async ({ connector, emit }) => {
        expect(connector.patterns.length).toBe(1)
        emit({
          type: 'tool_call_started',
          agent: 'cartographer',
          toolName: 'lookup_ecg_taxonomy',
          argsPreview: '{"query":"engineering"}',
        })
        return {
          trajectory: 'A drift toward applied, hands-on engineering.',
          pathways: [
            {
              label: 'Mechatronics-leaning engineering',
              reasoning: 'Reflections #1 and #6 cluster around hands-on assembly.',
              ecg_taxonomy_ids: ['cluster.engineering'],
            },
            {
              label: 'Mixed JC subject combination',
              reasoning: 'Reflections #3, #5, and #8 surface argumentative engagement.',
              ecg_taxonomy_ids: ['subject.h2-bio-art'],
            },
          ],
          disclaimer: 'Paths the pattern points toward, not careers to choose.',
        }
      },
    })

    expect(result.partial).toBe(false)
    expect(result.connectorOutputId).toBeGreaterThan(0)
    expect(result.pathfinderOutputId).toBeGreaterThan(0)

    const types = result.events.map((e) => e.type)
    expect(types[0]).toBe('agent_started')
    expect(types).toContain('tool_call_started')
    expect(types).toContain('tool_call_completed')
    expect(types).toContain('handoff')
    expect(types[types.length - 1]).toBe('run_completed')

    const handoffIdx = types.indexOf('handoff')
    const cartoStartIdx = types.findIndex((t, i) => i > handoffIdx && t === 'agent_started')
    expect(cartoStartIdx).toBeGreaterThan(handoffIdx)

    expect(latestConnectorOutput('demo')?.id).toBe(result.connectorOutputId)
    expect(latestPathfinderOutput('demo')?.id).toBe(result.pathfinderOutputId)
  })

  it('reports partial=true when Cartographer fails — Connector output still persisted', async () => {
    const result = await runSensemakingStreamed('demo', {
      runConnector: async () => ({
        patterns: [
          {
            text: 'A solid pattern with evidence.',
            strength: 'medium',
            evidence_reflection_ids: [1, 6],
          },
        ],
        still_unclear: null,
      }),
      runCartographer: async () => {
        throw new Error('rate-limited')
      },
    })

    expect(result.partial).toBe(true)
    expect(result.connectorOutputId).toBeGreaterThan(0)
    expect(result.pathfinderOutputId).toBeNull()
    const types = result.events.map((e) => e.type)
    expect(types).toContain('error')
  })

  it('reports partial=true when Connector fails — no Cartographer events emitted', async () => {
    const result = await runSensemakingStreamed('demo', {
      runConnector: async () => {
        throw new Error('connector blew up')
      },
    })
    expect(result.partial).toBe(true)
    expect(result.connectorOutputId).toBeNull()
    expect(result.pathfinderOutputId).toBeNull()
    const types = result.events.map((e) => e.type)
    // Connector started + error, no Cartographer agent_started, no run_completed.
    expect(types).toEqual(['agent_started', 'error'])
  })
})
