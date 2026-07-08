// Temporary body movers (plan 003 step 4): stand-ins for the plan-007
// animation clips, run in the `animation` phase purely to excite the springs.
// Extracted from PlaceholderBody so CharacterRoot (plan 006) reuses them.
//
// The walk stand-in (root-only circle, no bones) was replaced by the
// clip-driven Studio walk (advisor plan 001,
// `src/core/motion/studioWalk.ts` + `StudioWalkDriver.tsx`) — that session
// now owns the walk-circle debug button and articulates limbs via the
// authored gait clips. hop/shake remain here unchanged.

import type * as THREE from 'three'
import type { BodyMover } from '../state/studioStores'

const HOP_DURATION = 0.4
const HOP_HEIGHT = 0.15
const SHAKE_DURATION = 0.6
const SHAKE_AMPLITUDE = (25 * Math.PI) / 180
const SHAKE_CYCLES = 2.5

export function createBodyMover(root: THREE.Object3D, neck: THREE.Object3D): BodyMover {
  const basePos = root.position.clone()
  const baseNeckYaw = neck.rotation.y
  let hopT = Infinity
  let shakeT = Infinity

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
    },
    hop() {
      hopT = 0
    },
    shake() {
      shakeT = 0
    },
  }
}
