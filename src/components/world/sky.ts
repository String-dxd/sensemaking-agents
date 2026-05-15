import * as THREE from 'three'

/**
 * Student Space renders the actual sky as CSS behind a transparent canvas.
 * Keep this Three group intentionally empty so the island, rainbow, rain, and
 * aurora sit over the same page-level gradient instead of an app-owned dome.
 */
export function createSkyBackdrop(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-css-sky-placeholder'
  group.renderOrder = -100
  return group
}

export function tickSkyBackdrop() {}
