// Agent op vocabulary for the v3 tile grid. Cell coordinates are integers,
// 0-based, and inclusive. Consumed only by the CLI (scripts/apply-ops.mjs) and
// applyOps. NO three/r3f imports.

export type Op =
  | { op: 'fillRect'; c0: number; r0: number; c1: number; r1: number; tier: number }
  | { op: 'adjustRect'; c0: number; r0: number; c1: number; r1: number; delta: number }
  | { op: 'paintRect'; c0: number; r0: number; c1: number; r1: number; surface: number }
  | { op: 'reset' }

export interface OpError {
  index: number // position in the ops array
  op: string
  message: string
}
