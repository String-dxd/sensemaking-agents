import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
// SkeletonUtils.clone rebinds a skinned scene's skeleton to the clone; a plain
// .clone(true) leaves the SkinnedMesh bound to the ORIGINAL skeleton (see the
// character branch below for why that matters).
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { CHARACTER_HEIGHT, CHARACTER_SOURCE_HEIGHT } from './characterAsset'
import type { ObjectKind } from '../terrain/terrainGrid'
import { buildObjectModel, type ProceduralKind } from './buildObjectModel'
import { mulberry32 } from './rand'
import { applyToonMaterials } from './toonMaterial'

// The GLB lane: `tree`, `rock`, and `character` ship as authored .glb assets,
// built from the raw Meshy AI exports by scripts/optimize-meshy-glb.mjs and
// checked in under public/models/. `bush` is still procedural
// (buildObjectModel).
//
// The assets are EXT_meshopt_compression'd; nothing is needed here to read that
// — drei's useGLTF registers three's MeshoptDecoder by default. (Same for the
// rock's WebP base map: three decodes EXT_texture_webp natively.)
//
// GLB scenes are cached by drei's useGLTF and CLONED per placement — clones
// share geometry/materials with the cache, so they must never be disposed
// (userData.sharedAssets marks that; disposeObjectModel honors it).
const GLB_MODEL_URLS: Partial<Record<ObjectKind, string>> = {
  tree: '/models/tree.glb',
  rock: '/models/rock.glb',
  character: '/models/character.glb',
}
const GLB_URL_LIST = Object.values(GLB_MODEL_URLS)

/**
 * Seeded per-instance variety on a GLB clone, written to the 'canopy' node.
 *
 * Clones share geometry/materials with the useGLTF cache but own their node
 * TRANSFORMS, so this rearranges nothing cached. It has to go on 'canopy'
 * specifically: meshopt QUANTIZES vertex positions and compensates with a
 * translate+scale on the node that holds the mesh ('crown'), so rotating or
 * scaling THAT node would pivot the tree about the quantization offset instead
 * of its base — it would visibly swing off its stump. 'canopy' is a node we
 * author ourselves and quantization never touches it, so it stays identity and
 * is the one safe handle.
 *
 * Only X/Z scale and Y rotation are ours: the wind spring writes canopy
 * rotation.x/z and scale.y every frame (see useCanopyWind), and would overwrite
 * anything we left there.
 */
function randomizeInstance(model: THREE.Object3D, seed: number): void {
  const canopy = model.getObjectByName('canopy')
  if (!canopy) return // rock — stones don't sway, and don't need a pivot
  const rand = mulberry32(seed)
  canopy.rotation.y = rand() * Math.PI * 2
  // Girth only. Meshy fuses trunk and leaves into one mesh, so there are no
  // crown masses to re-compose the way the authored trees allowed — a stand of
  // these gets its variety from placement yaw/scale plus this width jitter.
  const girth = 0.92 + rand() * 0.16
  canopy.scale.x = girth
  canopy.scale.z = girth
}

/**
 * Resolve the display model for an object kind: a per-instance clone of the
 * cached GLB scene for authored kinds, a freshly built procedural group
 * otherwise. Deterministic per (kind, seed). Suspends while the GLB assets load,
 * so callers must render under <Suspense>.
 */
export function useObjectModel(kind: ObjectKind, seed: number): THREE.Group {
  // Every GLB is loaded unconditionally (stable hook order across kinds) — the
  // set is tiny and the cache is shared app-wide.
  const gltfs = useGLTF(GLB_URL_LIST)
  return useMemo(() => {
    let model: THREE.Group
    const url = GLB_MODEL_URLS[kind]
    // Anything without a GLB entry is by definition a procedural kind.
    if (!url) {
      model = buildObjectModel(kind as ProceduralKind, seed)
    } else {
      const source = gltfs[GLB_URL_LIST.indexOf(url)].scene
      // Toon-convert the CACHED scene in place (idempotent) BEFORE cloning, so
      // every clone — including the character's SkeletonUtils clone — shares
      // the converted materials and the never-dispose-shared rule holds
      // (plan 019: BOTW toon lighting).
      applyToonMaterials(source)
      if (kind === 'character') {
        // SkeletonUtils.clone: a plain .clone(true) leaves the SkinnedMesh
        // bound to the ORIGINAL skeleton — it would render at the cache's
        // pose/position, not the clone's. Wrap in a group so the world-scale
        // normalization (the runtime height contract) never touches the
        // skinned node itself.
        const inner = cloneSkinned(source) as THREE.Group
        model = new THREE.Group()
        model.add(inner)
        model.scale.setScalar(CHARACTER_HEIGHT / CHARACTER_SOURCE_HEIGHT)
      } else {
        model = source.clone(true) as THREE.Group
        randomizeInstance(model, seed)
      }
      model.userData.sharedAssets = true
    }

    // Enable shadows on all meshes in the model (single choke point for all
    // object kinds, catching both procedural and GLB-cloned instances).
    model.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
      // Animated verts move outside the static bounds computed at bind pose
      // and get frustum-culled mid-clip otherwise.
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
        node.frustumCulled = false
      }
    })

    return model
  }, [kind, seed, gltfs])
}

useGLTF.preload(GLB_URL_LIST)

/** Dispose a model returned by useObjectModel. Procedural groups own their
 *  geometry/materials and are disposed for real; GLB clones share the useGLTF
 *  cache and are left alone. (Textures are never disposed here — the shared
 *  modelTexture cache outlives instances; material.dispose() doesn't touch maps.) */
export function disposeObjectModel(model: THREE.Object3D): void {
  if (model.userData.sharedAssets) return
  model.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return
    n.geometry.dispose()
    const mats = Array.isArray(n.material) ? n.material : [n.material]
    for (const m of mats) m.dispose()
  })
}
