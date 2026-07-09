import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'
import { buildObjectModel, type ProceduralKind } from './buildObjectModel'
import { mulberry32 } from './rand'
import { modelTexture, type ModelTextureName } from './textures'

// The GLB lane: tree kinds ship as authored .glb assets (built + checked in by
// scripts/build-tree-glbs.mjs); the rest stay procedural (buildObjectModel).
// GLB scenes are cached by drei's useGLTF and CLONED per placement — clones
// share geometry/materials with the cache, so they must never be disposed
// (userData.sharedAssets marks that; disposeObjectModel honors it).
const GLB_MODEL_URLS: Partial<Record<ObjectKind, string>> = {
  fruitTree: '/models/fruitTree.glb',
  pine: '/models/pine.glb',
  palm: '/models/palm.glb',
}
const GLB_URL_LIST = Object.values(GLB_MODEL_URLS)

/**
 * Resolve the display model for an object kind: a per-instance clone of the
 * cached GLB scene for authored kinds, a freshly built procedural group
 * otherwise. Deterministic per (kind, seed) — GLB variety comes from a seeded
 * crown yaw (placement adds its own yaw/scale on top). Suspends while the GLB
 * assets load, so callers must render under <Suspense>.
 */
/** Per-kind FULL-COLOR surface maps (the sand-pipeline approach: the map IS
 *  the surface color; the GLB's hue-neutral vertex bake shades it). Keyed by
 *  the authoring material name. The GLBs carry fallback tints so untextured
 *  frames aren't white; when a map takes over, `tint` multiplies it — white
 *  renders the map as painted, the bark tints pull the golden wood maps toward
 *  the browns of the AC reference trunks. */
const SURFACE_MAPS: Record<string, { map: ModelTextureName; tint: number }> = {
  foliage: { map: 'foliage-leaves', tint: 0xffffff },
  'foliage-cedar': { map: 'foliage-cedar', tint: 0xffffff },
  frond: { map: 'palm-frond', tint: 0xffffff },
  'bark-palm': { map: 'palm-trunk', tint: 0xe8d3a8 },
  bark: { map: 'bark-painted', tint: 0xbf9a6e },
  'bark-cedar': { map: 'bark-painted', tint: 0xa87a58 },
}

/** Attach the codex-painted maps to a cached GLB scene's named materials, once
 *  (guarded per material — clones share these, so this runs a single time per
 *  asset for the app's lifetime). The map + white tint land only in the
 *  texture's onReady — until then (or forever, if the file is missing) the
 *  material keeps its authored fallback tint instead of rendering black. */
function attachPaintedMaps(scene: THREE.Object3D): void {
  scene.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return
    const mats = Array.isArray(n.material) ? n.material : [n.material]
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial) || m.userData.painted) continue
      m.userData.painted = true
      const entry = SURFACE_MAPS[m.name]
      if (!entry) continue
      modelTexture(entry.map, (tex) => {
        m.map = tex
        m.color.set(entry.tint)
        m.needsUpdate = true
      })
    }
  })
}

/** Seeded per-instance composition variety on a GLB clone. Clones share
 *  geometry/materials but own their node TRANSFORMS, so we can rearrange the
 *  crown without touching the cache: every tree gets a crown yaw; fruitTree
 *  additionally re-scales/nudges/spins each crown mass (the lobes overlap
 *  heavily, so ±10% keeps the mass cohesive while the silhouette changes);
 *  palm re-fans its frond holders. Pine skirts must stay put — the dense cone
 *  stack only tolerates yaw. The wind spring writes canopy rotation.x/z only,
 *  so all of this survives the sway. */
function randomizeComposition(model: THREE.Object3D, kind: ObjectKind, seed: number): void {
  const canopy = model.getObjectByName('canopy')
  if (!canopy) return
  const rand = mulberry32(seed)
  canopy.rotation.y = rand() * Math.PI * 2
  if (kind === 'fruitTree') {
    for (const child of canopy.children) {
      if (!(child as THREE.Mesh).isMesh) continue
      child.scale.multiplyScalar(0.9 + rand() * 0.2)
      child.position.x += (rand() - 0.5) * 0.07
      child.position.y += (rand() - 0.5) * 0.05
      child.position.z += (rand() - 0.5) * 0.07
      child.rotation.y += rand() * Math.PI
    }
  } else if (kind === 'palm') {
    for (const child of canopy.children) {
      if (child.children.length === 0) continue // frond holders only (groups)
      child.rotation.y += (rand() - 0.5) * 0.3
      child.rotation.z = (rand() - 0.5) * 0.1
    }
  }
}

export function useObjectModel(kind: ObjectKind, seed: number): THREE.Group {
  // Every GLB is loaded unconditionally (stable hook order across kinds) — the
  // set is tiny and the cache is shared app-wide.
  const gltfs = useGLTF(GLB_URL_LIST)
  return useMemo(() => {
    const url = GLB_MODEL_URLS[kind]
    // Anything without a GLB entry is by definition a procedural kind.
    if (!url) return buildObjectModel(kind as ProceduralKind, seed)
    const source = gltfs[GLB_URL_LIST.indexOf(url)].scene
    attachPaintedMaps(source)
    const model = source.clone(true) as THREE.Group
    model.userData.sharedAssets = true
    randomizeComposition(model, kind, seed)
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
    const mat = n.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat.dispose()
  })
}
