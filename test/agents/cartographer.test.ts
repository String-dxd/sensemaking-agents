import { describe, expect, expectTypeOf, it } from 'vitest'
import { buildCartographerAgent } from '~/agents/cartographer'
import type { AgentName } from '~/agents/run-events'
import { type CartographerOutputDraft, CartographerOutputSchema } from '~/agents/schemas'

/**
 * U11 — Cartographer schema is the v0.2 lead-sheet Trajectory shape. The
 * schema-level refinement enforces the 2–5 pathway count; the validity of
 * `trait_combination[].claim_id` and `ecg_region_tags[]` values is enforced
 * post-hoc by `run-cartographer.handler.server.ts` (where claim IDs and
 * cluster IDs are validated against per-student data and the ECG taxonomy
 * fixture respectively). The handler-level validator is exercised in
 * `test/server/run-cartographer.test.ts`.
 */

function pathway(overrides: Partial<CartographerOutputDraft['pathways'][number]> = {}) {
  return {
    label: 'Mechatronics-leaning engineering',
    trait_combination: [
      { claim_id: 'values.contribution', dimension: 'values' as const },
      { claim_id: 'skills.analytical', dimension: 'skills' as const, timeline_entry_id: 12 },
    ],
    ecg_region_tags: ['cluster.engineering'],
    risks_tradeoffs:
      'JC track delays hands-on workshop time by two years; poly preserves it but routes through different unis.',
    exploration_prompt:
      'What would a Friday-afternoon mechatronics-club visit look like before O-level subject combination choices close?',
    ...overrides,
  }
}

function output(overrides: Partial<CartographerOutputDraft> = {}): unknown {
  return {
    trajectory_paragraph:
      'Your reflections point toward applied, hands-on engineering — your CCA energy and your maths/physics fluency are reinforcing each other.',
    pathways: [pathway({ label: 'A' }), pathway({ label: 'B' })],
    open_questions: ['How does the pull toward teamwork hold up outside CCAs?'],
    disclaimer: 'These are paths the pattern points toward, not careers to choose.',
    ...overrides,
  }
}

describe('Cartographer agent factory', () => {
  it('exposes a buildCartographerAgent factory bound to a studentId', () => {
    const agent = buildCartographerAgent({ studentId: 'demo' })
    expect((agent as unknown as { name: string }).name).toBe('cartographer')
  })

  it('AgentName union accepts "cartographer" and rejects the legacy "pathfinder" literal', () => {
    const a: AgentName = 'cartographer'
    expect(a).toBe('cartographer')

    expectTypeOf<AgentName>().toEqualTypeOf<'connector' | 'cartographer'>()
    // @ts-expect-error — 'pathfinder' was removed from AgentName in U10.
    const _bad: AgentName = 'pathfinder'
    expect(_bad).toBe('pathfinder')
  })
})

describe('CartographerOutputSchema — v0.2 shape', () => {
  it('accepts a well-formed Trajectory page with 2 pathways', () => {
    const parsed = CartographerOutputSchema.safeParse(output())
    expect(parsed.success).toBe(true)
  })

  it('accepts the maximum of 5 pathways', () => {
    const parsed = CartographerOutputSchema.safeParse(
      output({
        pathways: [
          pathway({ label: 'A' }),
          pathway({ label: 'B' }),
          pathway({ label: 'C' }),
          pathway({ label: 'D' }),
          pathway({ label: 'E' }),
        ],
      }),
    )
    expect(parsed.success).toBe(true)
  })

  it('accepts an empty open_questions array', () => {
    const parsed = CartographerOutputSchema.safeParse(output({ open_questions: [] }))
    expect(parsed.success).toBe(true)
  })

  it('rejects fewer than 2 pathways (pathway-count refinement)', () => {
    const parsed = CartographerOutputSchema.safeParse(output({ pathways: [pathway()] }))
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => /2 to 5|min/.test(i.message))).toBe(true)
    }
  })

  it('rejects more than 5 pathways (pathway-count refinement)', () => {
    const parsed = CartographerOutputSchema.safeParse(
      output({
        pathways: [
          pathway({ label: 'A' }),
          pathway({ label: 'B' }),
          pathway({ label: 'C' }),
          pathway({ label: 'D' }),
          pathway({ label: 'E' }),
          pathway({ label: 'F' }),
        ],
      }),
    )
    expect(parsed.success).toBe(false)
  })

  it('rejects a pathway with an empty trait_combination', () => {
    const parsed = CartographerOutputSchema.safeParse(
      output({ pathways: [pathway({ trait_combination: [] }), pathway({ label: 'B' })] }),
    )
    expect(parsed.success).toBe(false)
  })

  it('rejects a pathway with an empty ecg_region_tags', () => {
    const parsed = CartographerOutputSchema.safeParse(
      output({ pathways: [pathway({ ecg_region_tags: [] }), pathway({ label: 'B' })] }),
    )
    expect(parsed.success).toBe(false)
  })

  it('rejects a pathway missing risks_tradeoffs', () => {
    const parsed = CartographerOutputSchema.safeParse(
      output({
        pathways: [
          {
            ...pathway(),
            risks_tradeoffs: '',
          },
          pathway({ label: 'B' }),
        ],
      }),
    )
    expect(parsed.success).toBe(false)
  })

  it('rejects a pathway missing exploration_prompt', () => {
    const parsed = CartographerOutputSchema.safeParse(
      output({
        pathways: [
          {
            ...pathway(),
            exploration_prompt: '',
          },
          pathway({ label: 'B' }),
        ],
      }),
    )
    expect(parsed.success).toBe(false)
  })

  it('rejects a trait_combination entry with an unknown dimension literal', () => {
    const parsed = CartographerOutputSchema.safeParse(
      output({
        pathways: [
          pathway({
            trait_combination: [
              // @ts-expect-error — 'mood' is not a valid dimension literal.
              { claim_id: 'values.foo', dimension: 'mood' },
            ],
          }),
          pathway({ label: 'B' }),
        ],
      }),
    )
    expect(parsed.success).toBe(false)
  })

  it('accepts trait_combination entries with and without timeline_entry_id', () => {
    const parsed = CartographerOutputSchema.safeParse(
      output({
        pathways: [
          pathway({
            trait_combination: [
              { claim_id: 'values.contribution', dimension: 'values' },
              {
                claim_id: 'skills.analytical',
                dimension: 'skills',
                timeline_entry_id: 42,
              },
            ],
          }),
          pathway({ label: 'B' }),
        ],
      }),
    )
    expect(parsed.success).toBe(true)
  })

  it('rejects an empty trajectory_paragraph', () => {
    const parsed = CartographerOutputSchema.safeParse(output({ trajectory_paragraph: '' }))
    expect(parsed.success).toBe(false)
  })

  it('rejects an empty disclaimer', () => {
    const parsed = CartographerOutputSchema.safeParse(output({ disclaimer: '' }))
    expect(parsed.success).toBe(false)
  })
})
