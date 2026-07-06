import { describe, expect, it } from 'vitest'
import { dolly, orbitAroundY, type Vec3 } from '../src/scene/cameraOps'

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function radiusXZ(pos: Vec3, target: Vec3): number {
  return Math.hypot(pos.x - target.x, pos.z - target.z)
}

describe('cameraOps — orbitAroundY', () => {
  const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

  it('rotates 90° around Y: (10,5,0) → (0,5,10)', () => {
    const out = orbitAroundY({ x: 10, y: 5, z: 0 }, ORIGIN, Math.PI / 2)
    expect(out.x).toBeCloseTo(0, 9)
    expect(out.y).toBeCloseTo(5, 9)
    expect(out.z).toBeCloseTo(10, 9)
  })

  it('preserves height (y) and orbit radius', () => {
    const pos: Vec3 = { x: 7, y: 11, z: -3 }
    const out = orbitAroundY(pos, ORIGIN, 0.9)
    expect(out.y).toBe(pos.y)
    expect(radiusXZ(out, ORIGIN)).toBeCloseTo(radiusXZ(pos, ORIGIN), 9)
  })

  it('round-trips over a full 360° turn', () => {
    const pos: Vec3 = { x: 14, y: 11, z: 14 }
    const out = orbitAroundY(pos, ORIGIN, Math.PI * 2)
    expect(out.x).toBeCloseTo(pos.x, 9)
    expect(out.y).toBeCloseTo(pos.y, 9)
    expect(out.z).toBeCloseTo(pos.z, 9)
  })

  it('orbits around a non-origin target', () => {
    const target: Vec3 = { x: 5, y: 0, z: 5 }
    const pos: Vec3 = { x: 15, y: 5, z: 5 } // radius 10 from target in xz
    const out = orbitAroundY(pos, target, Math.PI / 2)
    expect(out.x).toBeCloseTo(5, 9)
    expect(out.y).toBeCloseTo(5, 9)
    expect(out.z).toBeCloseTo(15, 9)
    expect(radiusXZ(out, target)).toBeCloseTo(10, 9)
  })
})

describe('cameraOps — dolly', () => {
  const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

  it('factor 0.5 halves the distance to target', () => {
    const pos: Vec3 = { x: 10, y: 0, z: 0 } // dist 10
    const out = dolly(pos, ORIGIN, 0.5)
    expect(dist(out, ORIGIN)).toBeCloseTo(5, 9)
  })

  it('clamps to minDist when zooming in too far', () => {
    const pos: Vec3 = { x: 10, y: 0, z: 0 } // dist 10
    const out = dolly(pos, ORIGIN, 0.1, 4, 120) // 10*0.1 = 1 < 4
    expect(dist(out, ORIGIN)).toBeCloseTo(4, 9)
  })

  it('clamps to maxDist when zooming out too far', () => {
    const pos: Vec3 = { x: 100, y: 0, z: 0 } // dist 100
    const out = dolly(pos, ORIGIN, 2, 4, 120) // 100*2 = 200 > 120
    expect(dist(out, ORIGIN)).toBeCloseTo(120, 9)
  })

  it('preserves the view direction from target', () => {
    const pos: Vec3 = { x: 6, y: 8, z: 12 }
    const before = dist(pos, ORIGIN)
    const out = dolly(pos, ORIGIN, 0.5)
    const after = dist(out, ORIGIN)
    const scale = after / before
    // Each component scales by the same factor (direction unchanged).
    expect(out.x / pos.x).toBeCloseTo(scale, 9)
    expect(out.y / pos.y).toBeCloseTo(scale, 9)
    expect(out.z / pos.z).toBeCloseTo(scale, 9)
  })

  it('dollies toward a non-origin target', () => {
    const target: Vec3 = { x: 2, y: 1, z: -3 }
    const pos: Vec3 = { x: 2, y: 1, z: 7 } // dist 10 along +z from target
    const out = dolly(pos, target, 0.5)
    expect(dist(out, target)).toBeCloseTo(5, 9)
    expect(out.x).toBeCloseTo(2, 9)
    expect(out.y).toBeCloseTo(1, 9)
    expect(out.z).toBeCloseTo(2, 9) // target.z + 5
  })
})
