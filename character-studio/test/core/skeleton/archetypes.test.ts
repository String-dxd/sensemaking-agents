import { describe, expect, it } from 'vitest'
import {
  archetypeColliderGroups,
  archetypeHead,
  ARCHETYPES_DEF,
  buildArchetypeSkeleton,
} from '../../../src/core/skeleton/archetypes'
import { restWorldPositions } from '../../../src/core/skeleton/canonical'
import { ARCHETYPES, BONE_NAMES } from '../../../src/core/spec/schema'

describe('archetype proportions', () => {
  it('defines all three archetypes and only those', () => {
    expect(Object.keys(ARCHETYPES_DEF).sort()).toEqual([...ARCHETYPES].sort())
  })

  it.each([...ARCHETYPES])('%s hits its height target at the skull top', (archetype) => {
    const built = buildArchetypeSkeleton(archetype)
    const world = restWorldPositions(built)
    const head = archetypeHead(archetype)
    const skullTop = world.head[1] + head.center[1] + head.radius
    expect(skullTop).toBeCloseTo(ARCHETYPES_DEF[archetype].height, 3)
  })

  it('height ordering: bird < biped-round < biped-slim', () => {
    expect(ARCHETYPES_DEF.bird.height).toBeLessThan(ARCHETYPES_DEF['biped-round'].height)
    expect(ARCHETYPES_DEF['biped-round'].height).toBeLessThan(ARCHETYPES_DEF['biped-slim'].height)
  })

  it.each([...ARCHETYPES])('%s keeps the full canonical bone set and grounded feet', (archetype) => {
    const built = buildArchetypeSkeleton(archetype)
    expect(built.bones.map((b) => b.name)).toEqual([...BONE_NAMES])
    const world = restWorldPositions(built)
    for (const foot of ['toesL', 'toesR'] as const) {
      expect(world[foot][1], `${archetype} ${foot} above ground`).toBeGreaterThan(0)
      expect(world[foot][1], `${archetype} ${foot} near ground`).toBeLessThan(0.08)
    }
  })

  it.each([...ARCHETYPES])('%s head is chibi-big relative to total height (chibi bar)', (archetype) => {
    const built = buildArchetypeSkeleton(archetype)
    const world = restWorldPositions(built)
    const head = archetypeHead(archetype)
    const headDiameter = head.radius * 2
    const total = world.head[1] + head.center[1] + head.radius
    const ratio = headDiameter / total
    // Bird villagers carry the biggest head of the three (AC bird remodel:
    // head diameter ≈55 % of height); bipeds stay in the ≈40-50 % chibi band.
    const [lo, hi] = archetype === 'bird' ? [0.45, 0.6] : [0.33, 0.52]
    expect(ratio, `${archetype} head ratio ${ratio.toFixed(2)}`).toBeGreaterThan(lo)
    expect(ratio, `${archetype} head ratio ${ratio.toFixed(2)}`).toBeLessThan(hi)
  })

  it('collider groups expose a head sphere inside the cranium + torso backstops (plan 008)', () => {
    for (const archetype of ARCHETYPES) {
      const groups = archetypeColliderGroups(archetype)
      expect(groups.map((g) => g.name)).toEqual(['head', 'torso'])
      const collider = groups[0].colliders[0]
      expect(collider.boneName).toBe('head')
      expect(collider.radius).toBeLessThan(archetypeHead(archetype).radius)
      expect(collider.radius).toBeGreaterThan(archetypeHead(archetype).radius * 0.8)
      // torso spheres ride animated spine bones and stay inside the garment
      // rest surface (backstop, not a rest-pose influence)
      const torso = groups[1]
      expect(torso.colliders.map((c) => c.boneName)).toEqual(['chest', 'hips'])
      for (const sphere of torso.colliders) {
        expect(sphere.radius).toBeGreaterThan(0)
        expect(sphere.radius).toBeLessThan(archetypeHead(archetype).radius)
      }
    }
  })
})
