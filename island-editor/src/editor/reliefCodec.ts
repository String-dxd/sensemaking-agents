import type { ReliefGrid } from '../terrain/islandSpec'

/** On-disk sparse form: only nonzero cells, as {index, height} pairs (agent-diffable). */
export interface SparseRelief {
  resolution: number
  encoding: 'sparse'
  entries: { i: number; h: number }[]
}

/** A serialized relief is either the legacy dense grid or the sparse form. */
export type SerializedRelief = ReliefGrid | SparseRelief

export function isSparseRelief(r: unknown): r is SparseRelief {
  return typeof r === 'object' && r !== null && (r as { encoding?: unknown }).encoding === 'sparse'
}

/**
 * Encode a dense grid for storage. Returns the sparse form ONLY when it is a
 * clear win — nonzero cells × 3 < resolution² (each {i,h} pair costs ~3× a bare
 * dense number in JSON, so this guarantees the sparse form is smaller). Otherwise
 * returns the dense grid unchanged. Lossless either way.
 */
export function encodeRelief(grid: ReliefGrid): SerializedRelief {
  const entries: { i: number; h: number }[] = []
  for (let i = 0; i < grid.data.length; i++) {
    if (grid.data[i] !== 0) entries.push({ i, h: grid.data[i] })
  }
  if (entries.length * 3 < grid.resolution * grid.resolution) {
    return { resolution: grid.resolution, encoding: 'sparse', entries }
  }
  return { resolution: grid.resolution, data: grid.data.slice() }
}

/** Expand any serialized relief back to a dense grid. Dense input is cloned through. */
export function decodeRelief(serialized: SerializedRelief): ReliefGrid {
  if (isSparseRelief(serialized)) {
    const data = new Array(serialized.resolution * serialized.resolution).fill(0)
    for (const { i, h } of serialized.entries) {
      if (i >= 0 && i < data.length) data[i] = h
    }
    return { resolution: serialized.resolution, data }
  }
  return { resolution: serialized.resolution, data: serialized.data.slice() }
}
