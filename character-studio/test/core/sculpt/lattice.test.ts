import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createCommandStack } from '../../../src/core/commands'
import {
  applyDelta,
  bernstein,
  bindToLattice,
  createLattice,
  createSculptCommand,
  evaluateLattice,
  getDeltaLayer,
  isZeroDelta,
  latticePointIndex,
} from '../../../src/core/sculpt'

const UNIT_BOX = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] }

describe('Sederberg–Parry lattice FFD', () => {
  it('bernstein bases partition unity', () => {
    for (const n of [1, 2, 3]) {
      for (const t of [0, 0.25, 0.5, 0.9, 1]) {
        let sum = 0
        for (let i = 0; i <= n; i++) sum += bernstein(n, i, t)
        expect(sum).toBeCloseTo(1, 10)
      }
    }
  })

  it('an identity lattice maps every bound point to itself (zero delta)', () => {
    const lattice = createLattice(UNIT_BOX, [3, 4, 3])
    const positions = new Float32Array([0.5, 0.5, 0.5, 0.1, 0.9, 0.3, 0, 0, 0, 1, 1, 1, 0.7, 0.2, 0.85])
    const binding = bindToLattice(lattice, positions)
    expect(binding.boundIndices.length).toBe(5)
    const out = evaluateLattice(lattice, binding)
    for (let r = 0; r < binding.boundIndices.length; r++) {
      const p = binding.boundIndices[r] * 3
      expect(out[r * 3]).toBeCloseTo(positions[p], 5)
      expect(out[r * 3 + 1]).toBeCloseTo(positions[p + 1], 5)
      expect(out[r * 3 + 2]).toBeCloseTo(positions[p + 2], 5)
    }
  })

  it('points outside the box are not bound and never move', () => {
    const lattice = createLattice(UNIT_BOX, [3, 4, 3])
    const positions = new Float32Array([1.5, 0.5, 0.5, -0.2, 0.5, 0.5, 0.5, 0.5, 0.5])
    const binding = bindToLattice(lattice, positions)
    expect(Array.from(binding.boundIndices)).toEqual([2])
  })

  it('moving one control point displaces the cell-center point by the hand-computed Bernstein weight', () => {
    // Resolution 3×4×3 → degrees (2,3,2). At the box center (s=t=u=0.5):
    //   B₁²(.5)=0.5, B₁³(.5)=C(3,1)·.5·.25=0.375, B₁²(.5)=0.5
    // so CP(1,1,1)'s weight is 0.5·0.375·0.5 = 0.09375.
    const lattice = createLattice(UNIT_BOX, [3, 4, 3])
    const positions = new Float32Array([0.5, 0.5, 0.5])
    const binding = bindToLattice(lattice, positions)
    const cp = latticePointIndex(lattice, 1, 1, 1)
    lattice.points[cp * 3] += 0.2
    lattice.points[cp * 3 + 1] += -0.4
    const out = evaluateLattice(lattice, binding)
    expect(out[0] - 0.5).toBeCloseTo(0.09375 * 0.2, 6)
    expect(out[1] - 0.5).toBeCloseTo(0.09375 * -0.4, 6)
    expect(out[2] - 0.5).toBeCloseTo(0, 6)
  })

  it("a corner control point's support excludes the opposite face", () => {
    const lattice = createLattice(UNIT_BOX, [3, 4, 3])
    // Far corner point (s=t=u=1) has B₀(1)=0 on every axis of CP(0,0,0).
    const positions = new Float32Array([1, 1, 1, 0.05, 0.05, 0.05])
    const binding = bindToLattice(lattice, positions)
    const cp = latticePointIndex(lattice, 0, 0, 0)
    lattice.points[cp * 3 + 1] += 0.5
    const out = evaluateLattice(lattice, binding)
    expect(out[1]).toBeCloseTo(1, 6) // far corner untouched
    expect(out[4]).toBeGreaterThan(0.05) // near-corner point moves
  })

  it('apply/undo round-trips a lattice bake through the command stack', () => {
    const geometry = new THREE.SphereGeometry(0.4, 12, 8)
    geometry.translate(0.5, 0.5, 0.5)
    const layer = getDeltaLayer(geometry)
    const before = new Float32Array(geometry.getAttribute('position').array as Float32Array)

    const lattice = createLattice(UNIT_BOX, [3, 4, 3])
    const binding = bindToLattice(lattice, layer.basePositions)
    expect(binding.boundIndices.length).toBeGreaterThan(0)

    // Stretch the lattice's top layer upward, bake into the delta layer.
    const [l, m, n] = lattice.resolution
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < l; i++) {
        lattice.points[latticePointIndex(lattice, i, m - 1, k) * 3 + 1] += 0.3
      }
    }
    const deformed = evaluateLattice(lattice, binding)
    const indices = binding.boundIndices
    const beforeDelta = new Float32Array(indices.length * 3) // all zero
    const afterDelta = new Float32Array(indices.length * 3)
    for (let r = 0; r < indices.length; r++) {
      const v = indices[r] * 3
      afterDelta[r * 3] = deformed[r * 3] - layer.basePositions[v]
      afterDelta[r * 3 + 1] = deformed[r * 3 + 1] - layer.basePositions[v + 1]
      afterDelta[r * 3 + 2] = deformed[r * 3 + 2] - layer.basePositions[v + 2]
    }

    const stack = createCommandStack()
    stack.execute(
      createSculptCommand({
        strokeId: 'lattice-apply-1',
        label: 'apply lattice',
        entries: [{ layer, indices, before: beforeDelta, after: afterDelta }],
      }),
    )
    const position = geometry.getAttribute('position')
    expect(isZeroDelta(layer)).toBe(false)
    // topmost vertex (t=0.9) rose by ≈ 0.3·B₃³(0.9) = 0.3·0.729 ≈ 0.219
    let maxY = -Infinity
    for (let v = 0; v < position.count; v++) maxY = Math.max(maxY, position.getY(v))
    expect(maxY).toBeCloseTo(0.9 + 0.3 * bernstein(3, 3, 0.9), 3)

    stack.undo()
    expect(isZeroDelta(layer)).toBe(true)
    const restored = position.array as Float32Array
    for (let i = 0; i < before.length; i++) expect(restored[i]).toBe(before[i])

    stack.redo()
    expect(isZeroDelta(layer)).toBe(false)
    applyDelta(layer)
    expect(position.getY(0)).toBeCloseTo(layer.basePositions[0 * 3 + 1] + layer.delta[1], 6)
  })
})
