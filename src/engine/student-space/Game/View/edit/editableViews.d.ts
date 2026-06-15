import type * as THREE from 'three'

export interface TransformPatch {
  x?: number
  z?: number
  yaw?: number
  scale?: number
}

export interface PlacedObject {
  id: string
  kind: string
  species?: string
  x: number
  z: number
  yaw: number
  scale: number
}

export interface EditableView {
  /** Resolve the THREE.Group for a layout id (null if not found). */
  getObject3D(layoutId: string): THREE.Object3D | null

  /** All raycasting hit targets for this kind. */
  hitTargets(): THREE.Object3D[]

  /**
   * Apply a partial transform to the mesh live.
   * Does NOT commit to IslandLayout — the caller (EditController) does.
   */
  applyTransform(id: string, t: TransformPatch): void

  /** Stub — implemented in plan 003. */
  spawn(obj: PlacedObject): void

  /** Stub — implemented in plan 003. */
  remove(id: string): void
}

export interface EditableViews {
  tree: EditableView
  flower: EditableView
  fruit: EditableView
  mailbox: EditableView
  telescope: EditableView
}

/** Build the per-kind adapter map for an active View instance. */
export function buildEditableViews(view: object, island: object): EditableViews
