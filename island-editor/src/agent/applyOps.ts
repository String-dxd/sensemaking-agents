import { applyBrush, type BrushMode } from '../terrain/brush'
import { deletePoint, insertPointAfter, movePointTo } from '../terrain/coastlineOps'
import type { IslandSpec } from '../terrain/islandSpec'
import { validateSpecObject } from '../editor/exportSpec'
import type { Op, OpError } from './ops'

const RELIEF_MODES: Record<string, BrushMode> = {
  raiseRegion: 'raise',
  lowerRegion: 'lower',
  smoothRegion: 'smooth',
  flattenRegion: 'flatten',
}

function applyOne(spec: IslandSpec, op: Op): IslandSpec {
  switch (op.op) {
    case 'movePoint':
      return { ...spec, coastline: movePointTo(spec.coastline, op.index, { x: op.x, z: op.z }) }
    case 'insertPointAfter':
      return { ...spec, coastline: insertPointAfter(spec.coastline, op.index) }
    case 'deletePoint': {
      const next = deletePoint(spec.coastline, op.index)
      if (next.length === spec.coastline.length) throw new Error('cannot delete below 3 points')
      return { ...spec, coastline: next }
    }
    case 'setHeightProfile':
      return { ...spec, heightProfile: { ...spec.heightProfile, ...op.profile } }
    case 'clearRelief':
      return {
        ...spec,
        relief: { resolution: spec.relief.resolution, data: new Array(spec.relief.data.length).fill(0) },
      }
    case 'raiseRegion':
    case 'lowerRegion':
    case 'smoothRegion':
    case 'flattenRegion': {
      const data = spec.relief.data.slice() // clone BEFORE the in-place brush
      const relief = { resolution: spec.relief.resolution, data }
      applyBrush(relief, spec.worldSize, op.x, op.z, {
        radius: op.radius,
        strength: op.strength,
        mode: RELIEF_MODES[op.op],
      })
      return { ...spec, relief }
    }
    default: {
      // Unknown op — untyped JSON (e.g. via the CLI) can carry an op outside the
      // union. The `never` assignment makes a forgotten case a COMPILE error; at
      // runtime this throws so the fold records an OpError instead of returning
      // undefined and poisoning `current`.
      const _exhaustive: never = op
      throw new Error(`unknown op: ${(_exhaustive as { op?: string })?.op ?? 'unrecognized'}`)
    }
  }
}

/** Fold ops over a spec. Never throws mid-batch; bad ops are skipped and recorded. */
export function applyOps(spec: IslandSpec, ops: Op[]): { spec: IslandSpec; errors: OpError[] } {
  let current = spec
  const errors: OpError[] = []
  ops.forEach((op, index) => {
    try {
      current = applyOne(current, op)
    } catch (e) {
      errors.push({
        index,
        op: (op as { op?: string } | null)?.op ?? 'unknown',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })
  try {
    validateSpecObject(current) // final gate; throws if the batch produced an invalid spec
  } catch (e) {
    errors.push({ index: -1, op: 'validate', message: e instanceof Error ? e.message : String(e) })
  }
  return { spec: current, errors }
}
