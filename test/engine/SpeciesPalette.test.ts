/**
 * Plan 005 — SpeciesPalette slice tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultSpeciesPalette,
  defaultSpeciesPaletteFromConstants,
} from '~/engine/student-space/Game/Data/speciesPalette.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import SpeciesPalette from '~/engine/student-space/Game/State/SpeciesPalette.js'

function freshPalette() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(SpeciesPalette as unknown as { instance: unknown }).instance = null
  new Persistence({ storage: memoryAdapter() })
  return new SpeciesPalette()
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(SpeciesPalette as unknown as { instance: unknown }).instance = null
  vi.restoreAllMocks()
})

// ── defaultSpeciesPalette ────────────────────────────────────────────────────

describe('defaultSpeciesPalette()', () => {
  it('returns a non-empty palette with tree/flower/fruit', () => {
    const p = defaultSpeciesPalette()
    expect(p.v).toBe(1)
    expect(Object.keys(p.tree).length).toBeGreaterThan(0)
    expect(Object.keys(p.flower).length).toBeGreaterThan(0)
    expect(Object.keys(p.fruit).length).toBeGreaterThan(0)
  })

  it('oak has colorA and colorB', () => {
    const p = defaultSpeciesPalette()
    expect(p.tree.oak?.colorA).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(p.tree.oak?.colorB).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('every fruit has a color', () => {
    const p = defaultSpeciesPalette()
    for (const [, v] of Object.entries(p.fruit)) {
      expect((v as { color: string }).color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('matches defaultSpeciesPaletteFromConstants()', () => {
    const fromJson = defaultSpeciesPalette()
    const fromConstants = defaultSpeciesPaletteFromConstants()
    expect(JSON.stringify(fromJson)).toBe(JSON.stringify(fromConstants))
  })
})

// ── SpeciesPalette slice ─────────────────────────────────────────────────────

describe('SpeciesPalette slice', () => {
  it('get(fruit, apple) returns color from default', () => {
    const pal = freshPalette()
    const c = pal.get('fruit', 'apple')
    expect(c?.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('setColor updates the get result', () => {
    const pal = freshPalette()
    pal.setColor('fruit', 'apple', { color: '#FF0000' })
    expect(pal.get('fruit', 'apple')?.color).toBe('#FF0000')
  })

  it('setColor fires paletteChanged', () => {
    const pal = freshPalette()
    const events: unknown[] = []
    pal.subscribe((e: unknown) => events.push(e))
    pal.setColor('tree', 'oak', { colorA: '#112233' })
    expect(events).toHaveLength(1)
    expect((events[0] as { type: string }).type).toBe('paletteChanged')
    expect((events[0] as { kind: string }).kind).toBe('tree')
  })

  it('isDiverged() false initially, true after setColor', () => {
    const pal = freshPalette()
    expect(pal.isDiverged()).toBe(false)
    pal.setColor('fruit', 'plum', { color: '#AABBCC' })
    expect(pal.isDiverged()).toBe(true)
  })

  it('revertToDefault resets to base colors', () => {
    const pal = freshPalette()
    const original = pal.get('fruit', 'apple')?.color
    pal.setColor('fruit', 'apple', { color: '#FF0000' })
    pal.revertToDefault()
    expect(pal.get('fruit', 'apple')?.color).toBe(original)
    expect(pal.isDiverged()).toBe(false)
  })

  it('revertToDefault fires paletteReplaced', () => {
    const pal = freshPalette()
    pal.setColor('fruit', 'plum', { color: '#AABBCC' })
    const events: { type: string }[] = []
    pal.subscribe((e: unknown) => events.push(e as { type: string }))
    pal.revertToDefault()
    expect(events.some((e) => e.type === 'paletteReplaced')).toBe(true)
  })

  it('serialize / hydrate round-trip preserves working copy', () => {
    const pal = freshPalette()
    pal.setColor('tree', 'cherry', { colorA: '#AABBCC' })
    const snap = pal.serialize()

    const pal2 = freshPalette()
    pal2.hydrate(snap)
    expect(pal2.isDiverged()).toBe(true)
    expect(pal2.get('tree', 'cherry')?.colorA).toBe('#AABBCC')
  })

  it('list() merges base and working copy', () => {
    const pal = freshPalette()
    const originalColor = pal.get('fruit', 'berry')?.color
    pal.setColor('fruit', 'berry', { color: '#FF1122' })
    const listed = pal.list()
    expect((listed.fruit.berry as { color: string }).color).toBe('#FF1122')
    pal.revertToDefault()
    expect(pal.get('fruit', 'berry')?.color).toBe(originalColor)
  })
})
