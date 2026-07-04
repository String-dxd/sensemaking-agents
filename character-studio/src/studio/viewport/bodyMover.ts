// Temporary body movers (plan 003 step 4): stand-ins for the plan-007
// animation clips, run in the `animation` phase purely to excite the springs.
// Extracted from PlaceholderBody so CharacterRoot (plan 006) reuses them.

import type * as THREE from 'three'
import type { BodyMover } from '../state/studioStores'

const HOP_DURATION = 0.4
const HOP_HEIGHT = 0.15
const SHAKE_DURATION = 0.6
const SHAKE_AMPLITUDE = (25 * Math.PI) / 180
const SHAKE_CYCLES = 2.5
const WALK_RADIUS = 1
const WALK_SPEED = 0.6

export function createBodyMover(root: THREE.Object3D, neck: THREE.Object3D): BodyMover {
  const basePos = root.position.clone()
  const baseRotY = root.rotation.y
  const baseNeckYaw = neck.rotation.y
  let hopT = Infinity
  let shakeT = Infinity
  let walking = false
  let theta = 0

  return {
    update(dt: number) {
      if (hopT <= HOP_DURATION) {
        const u = hopT / HOP_DURATION
        root.position.y = basePos.y + HOP_HEIGHT * Math.sin(Math.PI * u)
        hopT += dt
        if (hopT > HOP_DURATION) {
          root.position.y = basePos.y
          hopT = Infinity
        }
      }
      if (shakeT <= SHAKE_DURATION) {
        const u = shakeT / SHAKE_DURATION
        neck.rotation.y = baseNeckYaw + SHAKE_AMPLITUDE * Math.sin(2 * Math.PI * SHAKE_CYCLES * u) * (1 - u)
        shakeT += dt
        if (shakeT > SHAKE_DURATION) {
          neck.rotation.y = baseNeckYaw
          shakeT = Infinity
        }
      }
      if (walking) {
        // Circle of radius WALK_RADIUS through the home position, facing travel.
        theta += (WALK_SPEED / WALK_RADIUS) * dt
        root.position.x = basePos.x + Math.sin(theta) * WALK_RADIUS
        root.position.z = basePos.z + (Math.cos(theta) - 1) * WALK_RADIUS
        root.rotation.y = baseRotY + theta + Math.PI / 2
      }
    },
    hop() {
      hopT = 0
    },
    shake() {
      shakeT = 0
    },
    toggleWalk() {
      walking = !walking
      if (!walking) {
        root.position.copy(basePos)
        root.rotation.y = baseRotY
        theta = 0
      }
      return walking
    },
  }
}
