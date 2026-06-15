import type * as THREE from 'three'

export default class Selection {
  constructor(scene: THREE.Scene)

  /** Currently selected layout id, or null. */
  get(): string | null

  /** Select an object by layout id with its Three.js group for highlighting. */
  select(id: string, object3d: THREE.Object3D): void

  /** Clear the selection and remove highlights. */
  deselect(): void

  /** Update highlight position to track object movement. */
  update(object3d: THREE.Object3D): void

  /** Subscribe to selection changes. Returns unsubscribe fn. */
  onChange(cb: (id: string | null) => void): () => void

  /** Dispose highlights and remove from scene. */
  dispose(): void
}
