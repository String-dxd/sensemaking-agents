import type { HeightProfile } from '../terrain/islandSpec'

export type Op =
  | { op: 'movePoint'; index: number; x: number; z: number }
  | { op: 'insertPointAfter'; index: number }
  | { op: 'deletePoint'; index: number }
  | { op: 'setHeightProfile'; profile: Partial<HeightProfile> }
  | { op: 'raiseRegion'; x: number; z: number; radius: number; strength: number }
  | { op: 'lowerRegion'; x: number; z: number; radius: number; strength: number }
  | { op: 'smoothRegion'; x: number; z: number; radius: number; strength: number }
  | { op: 'flattenRegion'; x: number; z: number; radius: number; strength: number }
  | { op: 'clearRelief' }

export interface OpError {
  index: number // position in the ops array
  op: string
  message: string
}
