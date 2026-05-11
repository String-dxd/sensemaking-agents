import { describe, expect, expectTypeOf, it } from 'vitest'
import { buildCartographerAgent } from '~/agents/cartographer'
import type { AgentName } from '~/agents/run-events'
import { CartographerOutputSchema } from '~/agents/schemas'

describe('Cartographer agent (post-rename, v0.2)', () => {
  it('exposes a buildCartographerAgent factory bound to a studentId', () => {
    const agent = buildCartographerAgent({ studentId: 'demo' })
    // The SDK Agent has a `name` property — assert the rename took effect.
    expect((agent as unknown as { name: string }).name).toBe('cartographer')
  })

  it('CartographerOutputSchema preserves the v0.1 trajectory + pathways + disclaimer shape', () => {
    // U10 is a mechanical rename — the schema body is unchanged. U11 reshapes it.
    const ok = CartographerOutputSchema.safeParse({
      trajectory: 'A direction.',
      pathways: [
        {
          label: 'A',
          reasoning: 'because reflection #1',
          ecg_taxonomy_ids: ['cluster.engineering'],
        },
        {
          label: 'B',
          reasoning: 'because reflection #2',
          ecg_taxonomy_ids: ['cluster.engineering'],
        },
      ],
      disclaimer: 'These are paths the pattern points toward.',
    })
    expect(ok.success).toBe(true)
  })

  it('AgentName union accepts "cartographer" and rejects the legacy "pathfinder" literal', () => {
    // Runtime smoke: a "cartographer" literal is a valid AgentName.
    const a: AgentName = 'cartographer'
    expect(a).toBe('cartographer')

    // Type-level: the union must include 'cartographer' and 'connector'
    // and must NOT include the legacy 'pathfinder' literal.
    expectTypeOf<AgentName>().toEqualTypeOf<'connector' | 'cartographer'>()
    // The negative assertion: 'pathfinder' is no longer assignable.
    // @ts-expect-error — 'pathfinder' was removed from AgentName in U10.
    const _bad: AgentName = 'pathfinder'
    expect(_bad).toBe('pathfinder')
  })
})
