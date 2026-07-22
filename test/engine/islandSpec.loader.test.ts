// U1 loader tests: the committed spec validates at load, and any corruption
// routes to the frozen fallback — never null, never an empty world (R2).

import { describe, expect, it } from 'vitest'
import committedSpecJson from '~/engine/student-space/Game/Data/defaultIslandSpec.json'
import { FALLBACK_ISLAND_SPEC } from '~/engine/student-space/Game/Data/fallbackIslandSpec.ts'
import { loadIslandSpec, loadIslandSpecFrom } from '~/engine/student-space/Game/Data/islandSpec.ts'
import { validateSpecObject } from '~/engine/student-space/Game/State/islandSpecCore/specIO.ts'

describe('islandSpec loader', () => {
  it('loads and validates the committed spec', () => {
    const spec = loadIslandSpec()
    expect(spec.version).toBe(5)
    expect(spec.worldSize).toBe(24)
    expect(spec.grid.cols).toBe(64)
    expect(spec.objects.length).toBeGreaterThan(0)
  })

  it('a corrupted payload yields the frozen fallback spec, never null', () => {
    const corrupted = JSON.parse(JSON.stringify(committedSpecJson))
    corrupted.grid.tiers[3] = 'not a valid row'
    const spec = loadIslandSpecFrom(corrupted)
    expect(spec).not.toBeNull()
    expect(spec).toEqual(validateSpecObject(FALLBACK_ISLAND_SPEC))
  })

  it('garbage and missing payloads also fall back', () => {
    const fallback = validateSpecObject(FALLBACK_ISLAND_SPEC)
    expect(loadIslandSpecFrom(undefined)).toEqual(fallback)
    expect(loadIslandSpecFrom({ version: 99 })).toEqual(fallback)
    expect(loadIslandSpecFrom('nonsense')).toEqual(fallback)
  })

  it('the frozen fallback is itself a valid, non-empty island', () => {
    const fallback = validateSpecObject(FALLBACK_ISLAND_SPEC)
    expect(fallback.grid.tiers.some((t) => t >= 2)).toBe(true)
    expect(fallback.objects.length).toBeGreaterThan(0)
  })
})
