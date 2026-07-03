import { describe, expect, it } from 'vitest'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'
import { CHARACTER_FILE_EXTENSION, parseSpec, serializeSpec } from '../../../src/core/spec/io'

describe('serializeSpec / parseSpec', () => {
  it('round-trips: parse(serialize(spec)) deep-equals the original', () => {
    const spec = createDefaultCharacter('bird', 'mischievous')
    const roundTripped = parseSpec(serializeSpec(spec))
    expect(roundTripped).toEqual(spec)
  })

  it('serializing the same spec twice produces byte-identical output', () => {
    const spec = createDefaultCharacter('biped-slim', 'proud')
    expect(serializeSpec(spec)).toBe(serializeSpec(spec))
  })

  it('serialize -> parse -> serialize is byte-identical', () => {
    const spec = createDefaultCharacter('biped-round', 'calm')
    const once = serializeSpec(spec)
    const twice = serializeSpec(parseSpec(once))
    expect(twice).toBe(once)
  })

  it('serialized output has keys sorted at every object level', () => {
    const spec = createDefaultCharacter('biped-round', 'gentle')
    const json = serializeSpec(spec)
    const parsed = JSON.parse(json)

    function assertSorted(value: unknown): void {
      if (Array.isArray(value)) {
        for (const item of value) assertSorted(item)
        return
      }
      if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>)
        const sorted = [...keys].sort()
        expect(keys).toEqual(sorted)
        for (const key of keys) assertSorted((value as Record<string, unknown>)[key])
      }
    }

    assertSorted(parsed)
  })

  it('uses the <name>.character.json file extension contract', () => {
    expect(CHARACTER_FILE_EXTENSION).toBe('.character.json')
  })

  it('round-trips studioLook (lights, environment, ambientFloor) including an explicit portraitCamera bookmark (plan 010)', () => {
    const spec = createDefaultCharacter('biped-round', 'gentle')
    spec.studioLook = {
      ...spec.studioLook!,
      portraitCamera: { position: [1.5, 2.1, 2.6], target: [0, 0.9, 0], fov: 28 },
    }
    const roundTripped = parseSpec(serializeSpec(spec))
    expect(roundTripped.studioLook).toEqual(spec.studioLook)
    expect(roundTripped.studioLook?.portraitCamera).toEqual({ position: [1.5, 2.1, 2.6], target: [0, 0.9, 0], fov: 28 })
  })
})
