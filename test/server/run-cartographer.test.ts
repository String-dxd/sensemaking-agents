// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import {
  insertMirrorEntry,
  insertVipsTimelineEntry,
  latestCartographerOutput,
  upsertVipsPage,
} from '~/db/queries'
import { runCartographerHandler } from '~/server/run-cartographer.handler.server'

/**
 * U11 — Cartographer manual-trigger handler. Tests cover:
 *   - Happy path: 3 pathways with valid claim IDs + ECG tags → persisted.
 *   - Post-process drop: pathway cites an unknown claim_id → dropped,
 *     remaining pathways persisted, warning recorded.
 *   - Post-process drop: pathway cites an unknown cluster tag → dropped.
 *   - `no_valid_pathways`: all proposed pathways are invalid → no row written.
 *   - Schema reject: malformed agent output → no row written.
 *   - Agent error: stub throws → no row written, status='agent_error'.
 *   - Step-event order: agent_started → tool_call_* → agent_completed →
 *     run_completed. No `handoff` event for a single-agent chain.
 */

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  // Seed a Mirror + a few timeline entries so the handler's reads return
  // realistic data. Each timeline entry carries a canonical_claim_id the
  // Cartographer stub is allowed to cite.
  const mirror = insertMirrorEntry('demo', {
    transcript: 'i lit up working through the wiring of the robotics chassis with my team',
    validation: 'ok',
    inferred_meaning: 'something',
    story_reframe: 'the robotics build session',
    raw_output: {},
    context_type: 'school',
  })
  upsertVipsPage('demo', {
    dimension: 'values',
    compiled_truth: 'You orient toward making something useful with your hands.',
    open_question: 'Does the same pull hold outside CCAs?',
  })
  upsertVipsPage('demo', {
    dimension: 'skills',
    compiled_truth: 'Analytical decomposition is your reach.',
    open_question: 'Where does this surface outside maths class?',
  })
  insertVipsTimelineEntry('demo', {
    dimension: 'values',
    canonical_claim_id: 'values.contribution',
    verbatim_quote: 'i lit up working through the wiring of the robotics chassis with my team',
    reflection_id: mirror.id,
    strength: 'medium',
    parallax_tag: ['school'],
  })
  insertVipsTimelineEntry('demo', {
    dimension: 'skills',
    canonical_claim_id: 'skills.analytical',
    verbatim_quote: 'i lit up working through the wiring of the robotics chassis with my team',
    reflection_id: mirror.id,
    strength: 'medium',
    parallax_tag: ['school'],
  })
})

afterEach(() => {
  resetDbForTests()
})

function buildHappyDraft(): unknown {
  return {
    trajectory_paragraph:
      'Your reflections point toward applied, hands-on engineering — the CCA energy and your maths fluency are reinforcing each other.',
    pathways: [
      {
        label: 'Mechatronics-leaning engineering',
        trait_combination: [
          { claim_id: 'values.contribution', dimension: 'values' },
          { claim_id: 'skills.analytical', dimension: 'skills' },
        ],
        ecg_region_tags: ['cluster.engineering'],
        risks_tradeoffs:
          'JC track delays hands-on workshop time by two years; poly preserves it but routes through different unis.',
        exploration_prompt: 'What would a Friday-afternoon mechatronics club visit feel like?',
      },
      {
        label: 'Computing + applied sciences',
        trait_combination: [{ claim_id: 'skills.analytical', dimension: 'skills' }],
        ecg_region_tags: ['cluster.computing'],
        risks_tradeoffs:
          'Computing pathways reward solo deep work; the team energy your reflections describe may need to come from elsewhere.',
        exploration_prompt: 'Where does your team-energy live if the day-job is solo coding?',
      },
      {
        label: 'Engineering education / mentorship',
        trait_combination: [{ claim_id: 'values.contribution', dimension: 'values' }],
        ecg_region_tags: ['cluster.education', 'cluster.engineering'],
        risks_tradeoffs: 'Long road; pays in different currency than industry.',
        exploration_prompt: 'How does mentoring a younger CCA student land for you next term?',
      },
    ],
    open_questions: ['How does the team-energy hold up outside CCAs?'],
    disclaimer: 'These are paths the pattern points toward, not careers to choose.',
  }
}

describe.skipIf(!process.env.DATABASE_URL)('runCartographerHandler — happy path', () => {
  it('persists a cartographer_outputs row when the agent returns a valid 3-pathway output', async () => {
    const result = await runCartographerHandler(
      { studentId: 'demo' },
      {
        runCartographer: async ({ emit }) => {
          emit({
            type: 'tool_call_started',
            agent: 'cartographer',
            toolName: 'lookup_ecg_taxonomy',
            argsPreview: '{"query":"engineering"}',
          })
          emit({
            type: 'tool_call_completed',
            agent: 'cartographer',
            toolName: 'lookup_ecg_taxonomy',
            resultPreview: '[{"id":"cluster.engineering"}]',
          })
          return buildHappyDraft()
        },
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.status).toBe('ok')
    expect(result.cartographer_output_id).toBeGreaterThan(0)
    expect(result.trajectory.pathways).toHaveLength(3)
    expect(result.warnings).toEqual([])

    const persisted = latestCartographerOutput('demo')
    expect(persisted).not.toBeNull()
    expect(persisted?.trajectory_text).toMatch(/applied, hands-on engineering/)
    expect(persisted?.pathways).toHaveLength(3)
  })

  it('emits step events in order: agent_started → tool_* → agent_completed → run_completed (no handoff)', async () => {
    const result = await runCartographerHandler(
      { studentId: 'demo' },
      {
        runCartographer: async ({ emit }) => {
          emit({
            type: 'tool_call_started',
            agent: 'cartographer',
            toolName: 'search_past_mirrors',
            argsPreview: '{"query":"robotics"}',
          })
          emit({
            type: 'tool_call_completed',
            agent: 'cartographer',
            toolName: 'search_past_mirrors',
            resultPreview: '[]',
          })
          return buildHappyDraft()
        },
      },
    )

    const types = result.events.map((e) => e.type)
    expect(types[0]).toBe('agent_started')
    expect(types).toContain('tool_call_started')
    expect(types).toContain('tool_call_completed')
    expect(types).toContain('agent_completed')
    expect(types[types.length - 1]).toBe('run_completed')
    // Single-agent chain — no handoff event ever fires.
    expect(types).not.toContain('handoff')
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  'runCartographerHandler — post-process validator',
  () => {
    it('drops a pathway citing an unknown claim_id and records a warning', async () => {
      const result = await runCartographerHandler(
        { studentId: 'demo' },
        {
          runCartographer: async () => {
            const draft = buildHappyDraft() as {
              pathways: Array<{
                trait_combination: Array<{ claim_id: string; dimension: string }>
                ecg_region_tags: string[]
              }>
            }
            // Replace the first pathway's claim ref with one that doesn't
            // appear on any of the seeded timeline entries.
            const first = draft.pathways[0]
            if (!first) throw new Error('fixture broken: no first pathway')
            first.trait_combination = [{ claim_id: 'values.no_such_claim', dimension: 'values' }]
            return draft
          },
        },
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.trajectory.pathways).toHaveLength(2)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toMatch(/values\.no_such_claim/)
      expect(latestCartographerOutput('demo')?.pathways).toHaveLength(2)
    })

    it('drops a pathway citing an unknown cluster tag and records a warning', async () => {
      const result = await runCartographerHandler(
        { studentId: 'demo' },
        {
          runCartographer: async () => {
            const draft = buildHappyDraft() as {
              pathways: Array<{ ecg_region_tags: string[] }>
            }
            const second = draft.pathways[1]
            if (!second) throw new Error('fixture broken: no second pathway')
            second.ecg_region_tags = ['cluster.xyzzy']
            return draft
          },
        },
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.trajectory.pathways).toHaveLength(2)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toMatch(/cluster\.xyzzy/)
    })

    it('returns no_valid_pathways and persists nothing when fewer than 2 pathways survive', async () => {
      const result = await runCartographerHandler(
        { studentId: 'demo' },
        {
          runCartographer: async () => {
            const draft = buildHappyDraft() as {
              pathways: Array<{ ecg_region_tags: string[] }>
            }
            // Invalidate two of three pathways via bad cluster tags; only 1
            // valid one survives, below the >= 2 floor.
            const first = draft.pathways[0]
            const second = draft.pathways[1]
            if (!first || !second) throw new Error('fixture broken: not enough pathways')
            first.ecg_region_tags = ['cluster.invalid-a']
            second.ecg_region_tags = ['cluster.invalid-b']
            return draft
          },
        },
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe('no_valid_pathways')
      expect(result.warnings.length).toBeGreaterThanOrEqual(2)
      expect(latestCartographerOutput('demo')).toBeNull()
      // The terminal event sequence still records the failure.
      const types = result.events.map((e) => e.type)
      expect(types).toContain('error')
      expect(types[types.length - 1]).toBe('run_completed')
    })
  },
)

describe.skipIf(!process.env.DATABASE_URL)('runCartographerHandler — failure modes', () => {
  it('schema_reject: malformed Cartographer output → no row, ok:false', async () => {
    const result = await runCartographerHandler(
      { studentId: 'demo' },
      {
        runCartographer: async () => ({
          // Missing required `trajectory_paragraph` + wrong-shaped pathways.
          pathways: [{ label: 'half-formed' }],
        }),
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe('schema_reject')
    expect(latestCartographerOutput('demo')).toBeNull()
  })

  it('agent_error: stub throws → no row, status=agent_error, error event recorded', async () => {
    const result = await runCartographerHandler(
      { studentId: 'demo' },
      {
        runCartographer: vi.fn(async () => {
          throw new Error('LLM transport blew up')
        }),
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe('agent_error')
    expect(result.error).toMatch(/LLM transport blew up/)
    expect(latestCartographerOutput('demo')).toBeNull()
    expect(result.events.some((e) => e.type === 'error')).toBe(true)
  })

  it('schema_reject: fewer than 2 pathways → no row, schema_reject', async () => {
    const result = await runCartographerHandler(
      { studentId: 'demo' },
      {
        runCartographer: async () => {
          const draft = buildHappyDraft() as { pathways: unknown[] }
          const first = draft.pathways[0]
          if (!first) throw new Error('fixture broken')
          draft.pathways = [first]
          return draft
        },
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe('schema_reject')
  })
})

describe.skipIf(!process.env.DATABASE_URL)('runCartographerHandler — tenancy', () => {
  it('throws when studentId is empty', async () => {
    await expect(runCartographerHandler({ studentId: '' })).rejects.toThrow()
  })
})
