// Terrain-aware azimuth picker for the close-up camera shots (capture sheet,
// kira-narrator). Those shots approach Kira from the camera's CURRENT compass
// direction at a fixed distance — if that direction points into a cliff, the
// dolly parks the camera inside/behind terrain and the frame reads blank.
//
// `clearApproachUnit` keeps the preferred direction when its sight line is
// clear, otherwise orbits around the target in widening steps (alternating
// left/right, so the chosen shot stays as close as possible to the current
// framing) until it finds an azimuth where:
//   1. the camera position itself sits above the terrain, and
//   2. the terrain stays below the camera→target sight line.
// The test walks the island heightfield, which is what the world's cliffs
// are made of — no raycasting needed.

type IslandLike = { heightAt?: (x: number, z: number) => number }

/** Radians to try around the preferred azimuth, nearest-first. */
const CANDIDATE_OFFSETS = [
  0,
  0.35,
  -0.35,
  0.7,
  -0.7,
  1.1,
  -1.1,
  1.6,
  -1.6,
  2.2,
  -2.2,
  2.7,
  -2.7,
  Math.PI,
]

/** Camera must clear the ground under it by this much (world units). */
const CAMERA_GROUND_CLEARANCE = 0.3

/** Terrain poking this far above the sight line counts as blocking. */
const SIGHT_LINE_MARGIN = 0.2

const SIGHT_SAMPLES = 10

export function clearApproachUnit(
  island: IslandLike | null | undefined,
  target: { x: number; y: number; z: number },
  preferredUnit: { x: number; z: number },
  distance: number,
  camY: number,
): { x: number; z: number } {
  const heightAt = island?.heightAt?.bind(island)
  if (!heightAt) return preferredUnit
  const base = Math.atan2(preferredUnit.z, preferredUnit.x)
  for (const offset of CANDIDATE_OFFSETS) {
    const angle = base + offset
    const ux = Math.cos(angle)
    const uz = Math.sin(angle)
    if (isClear(heightAt, target, ux, uz, distance, camY)) return { x: ux, z: uz }
  }
  // Every azimuth blocked (deep canyon) — keep the caller's framing.
  return preferredUnit
}

function isClear(
  heightAt: (x: number, z: number) => number,
  target: { x: number; y: number; z: number },
  ux: number,
  uz: number,
  distance: number,
  camY: number,
): boolean {
  const cx = target.x + ux * distance
  const cz = target.z + uz * distance
  if (heightAt(cx, cz) > camY - CAMERA_GROUND_CLEARANCE) return false
  for (let i = 1; i < SIGHT_SAMPLES; i++) {
    const t = i / SIGHT_SAMPLES
    const x = cx + (target.x - cx) * t
    const z = cz + (target.z - cz) * t
    const y = camY + (target.y - camY) * t
    if (heightAt(x, z) > y + SIGHT_LINE_MARGIN) return false
  }
  return true
}
