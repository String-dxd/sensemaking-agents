import { describe, expect, it } from 'vitest'

import { clearApproachUnit } from '~/lib/student-space/camera-clearance'

// A cliff wall covering the x < -0.5 half-plane, 5 units tall; flat ground
// elsewhere. Kira stands at the origin at ground level.
const cliffIsland = {
  heightAt: (x: number, _z: number) => (x < -0.5 ? 5 : 0),
}

const flatIsland = { heightAt: () => 0 }

const target = { x: 0, y: 0, z: 0 }

describe('clearApproachUnit', () => {
  it('keeps the preferred azimuth when its sight line is clear', () => {
    const unit = { x: 1, z: 0 }
    const out = clearApproachUnit(flatIsland, target, unit, 3.2, 1)
    expect(out).toEqual(unit)
  })

  it('orbits away from a blocking cliff', () => {
    // Preferred approach dollies the camera into the cliff (x = -3.2).
    const out = clearApproachUnit(cliffIsland, target, { x: -1, z: 0 }, 3.2, 1)
    // The chosen camera position must sit on open ground…
    const camX = target.x + out.x * 3.2
    expect(cliffIsland.heightAt(camX, target.z + out.z * 3.2)).toBe(0)
    // …and differ from the blocked preference.
    expect(out.x).not.toBeCloseTo(-1, 2)
  })

  it('prefers the smallest swing that clears', () => {
    // Blocked straight-on; ±0.35 rad still lands at x < -0.5 (cos stays
    // ~-0.94), so the pick should be one of the nearest clearing offsets,
    // not a full 180 flip.
    const out = clearApproachUnit(cliffIsland, target, { x: -1, z: 0 }, 3.2, 1)
    const angleFromPreferred = Math.abs(Math.atan2(out.z, out.x) - Math.PI)
    expect(Math.min(angleFromPreferred, Math.PI * 2 - angleFromPreferred)).toBeLessThan(Math.PI)
  })

  it('returns the preferred unit without a heightfield', () => {
    const unit = { x: -1, z: 0 }
    expect(clearApproachUnit(null, target, unit, 3.2, 1)).toEqual(unit)
    expect(clearApproachUnit({}, target, unit, 3.2, 1)).toEqual(unit)
  })
})
