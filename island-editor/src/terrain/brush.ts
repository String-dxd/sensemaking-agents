import type { ReliefGrid } from './islandSpec'

export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten'

export interface BrushParams {
  radius: number // world units
  strength: number // per-dab intensity
  mode: BrushMode
}

/** Smooth bump falloff: 1 at the center → 0 at the edge. */
function falloff(t: number): number {
  const u = Math.max(0, Math.min(1, t))
  const k = 1 - u * u
  return k * k
}

function avgAround(arr: number[], res: number, ix: number, iz: number): number {
  let sum = 0
  let count = 0
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = ix + dx
      const z = iz + dz
      if (x < 0 || z < 0 || x >= res || z >= res) continue
      sum += arr[z * res + x]
      count++
    }
  }
  return count ? sum / count : arr[iz * res + ix]
}

/**
 * Apply one brush dab centered at world (cx, cz). Mutates `relief.data` in place
 * (the caller bumps React state to trigger a cheap geometry update). Pure w.r.t.
 * everything except the passed grid — headless-testable.
 */
export function applyBrush(
  relief: ReliefGrid,
  worldSize: number,
  cx: number,
  cz: number,
  p: BrushParams,
): void {
  const res = relief.resolution
  const data = relief.data
  if (res < 2 || data.length < res * res) return

  const half = worldSize / 2
  const cellW = worldSize / (res - 1)
  const rCells = Math.ceil(p.radius / cellW) + 1
  const gcx = ((cx + half) / worldSize) * (res - 1)
  const gcz = ((cz + half) / worldSize) * (res - 1)
  const ix0 = Math.max(0, Math.floor(gcx - rCells))
  const ix1 = Math.min(res - 1, Math.ceil(gcx + rCells))
  const iz0 = Math.max(0, Math.floor(gcz - rCells))
  const iz1 = Math.min(res - 1, Math.ceil(gcz + rCells))
  const r2 = p.radius * p.radius

  // smooth needs a stable snapshot so averaging isn't order-dependent.
  const snapshot = p.mode === 'smooth' ? data.slice() : null

  // flatten pulls toward the relief at the brush center.
  let flattenTarget = 0
  if (p.mode === 'flatten') {
    const cix = Math.max(0, Math.min(res - 1, Math.round(gcx)))
    const ciz = Math.max(0, Math.min(res - 1, Math.round(gcz)))
    flattenTarget = data[ciz * res + cix]
  }

  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const wx = -half + ix * cellW
      const wz = -half + iz * cellW
      const dd = (wx - cx) * (wx - cx) + (wz - cz) * (wz - cz)
      if (dd > r2) continue
      const w = falloff(Math.sqrt(dd) / p.radius) * p.strength
      const i = iz * res + ix
      switch (p.mode) {
        case 'raise':
          data[i] += w
          break
        case 'lower':
          data[i] -= w
          break
        case 'flatten':
          data[i] += (flattenTarget - data[i]) * w
          break
        case 'smooth': {
          const avg = avgAround(snapshot as number[], res, ix, iz)
          data[i] += (avg - data[i]) * w
          break
        }
      }
    }
  }
}
