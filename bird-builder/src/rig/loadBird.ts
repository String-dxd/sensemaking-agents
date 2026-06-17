import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { SLOTS } from '../bird/slots'

// Prepare a loaded GLB scene as the dressable base: deep-clone (preserving bone
// references via SkeletonUtils so the cache isn't mutated), apply engine-parity
// transform, index the bones + skeleton (for rebinding skinned garments later),
// and resolve a per-slot attach node (for rigid V1 accessories).

export interface PreparedBase {
  scene: THREE.Group
  bones: Record<string, THREE.Bone>
  skeleton: THREE.Skeleton | null
  /** slotId → the Object3D a rigid accessory portals into (falls back to scene). */
  attachNodes: Record<string, THREE.Object3D>
}

// Engine parity (Kira.js loadMaskedScene): feet at y=0, beak along -Y → +90° yaw
// lands the beak on +X; displayed at 0.30 scale.
const BASE_SCALE = 0.3
const BASE_YAW = Math.PI / 2

function findByName(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((o) => {
    if (!found && re.test(o.name)) found = o
  })
  return found
}

export function prepareBase(gltfScene: THREE.Object3D): PreparedBase {
  const scene = cloneSkeleton(gltfScene) as THREE.Group
  scene.scale.setScalar(BASE_SCALE)
  scene.rotation.y = BASE_YAW

  const bones: Record<string, THREE.Bone> = {}
  let skeleton: THREE.Skeleton | null = null
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone
    const sm = o as THREE.SkinnedMesh
    if (sm.isSkinnedMesh && !skeleton) skeleton = sm.skeleton
  })

  // Resolve each slot's attach target: the named bone, else a node matching the
  // bone name, else the rig root, else the whole scene. Best-effort — exact fit
  // is tuned per item in buildItem's `fit`.
  const attachNodes: Record<string, THREE.Object3D> = {}
  const rigRoot = findByName(scene, /MB_Rig/i) ?? scene
  for (const slot of SLOTS) {
    let node: THREE.Object3D | null = null
    if (slot.attachBone) {
      node =
        bones[slot.attachBone] ??
        findByName(scene, new RegExp(slot.attachBone.replace(/\./g, '\\.'), 'i'))
    }
    attachNodes[slot.id] = node ?? rigRoot
  }

  return { scene, bones, skeleton, attachNodes }
}
