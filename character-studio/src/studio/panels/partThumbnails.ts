// Lazy offscreen part thumbnails (plan 006 step 5; reworked plan 021 step 1
// for the Mii-style card grid): every non-empty part has had a procedural
// source since plan 013, so `getPartThumbnail` now builds and renders the
// part's OWN geometry directly — no GLB round-trip, no stale-mesh mismatch
// (the old GLB thumbnails no longer matched the procedural bodies at all).
// The GLB path survives only for a def with no procedural source (none
// exist today; kept for the empty/"none" contract + wardrobe items, which
// still ship GLBs). The renderer is shared and 96×96 — one render per
// (partId, meshVersion), on first sight in the picker; cache key includes
// meshVersion so a 018-style geometry rebuild invalidates automatically.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getPart, meshVersionOf } from '../../core/skeleton/partRegistry'

const SIZE = 96
const cache = new Map<string, Promise<string | null>>()

let shared: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null

function getShared() {
  if (!shared) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(SIZE, SIZE)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x7a6f8a, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.0)
    key.position.set(2, 3, 4)
    scene.add(key)
    const camera = new THREE.PerspectiveCamera(30, 1, 0.001, 10)
    shared = { renderer, scene, camera }
  }
  return shared
}

const THUMB_MATERIAL = new THREE.MeshToonMaterial({ color: '#e8a15c' })

/**
 * Fixed preview palette (plan 021 step 1) — thumbnails bake channels to
 * vertex colors instead of threading the character's live palette through
 * the cache, so a beak card reads yellow-ish and a wattle red-ish without
 * every part re-rendering on every palette edit. Channel semantics mirror
 * the toon shader's USE_PALETTE_VERTEX path exactly: R(+remainder)=primary,
 * G=secondary, B=belly, A=accentA (see toonMaterial.ts MASK_FRAGMENT).
 */
const PREVIEW_PRIMARY = new THREE.Color('#e8a15c')
const PREVIEW_SECONDARY = new THREE.Color('#c98a4a')
const PREVIEW_BELLY = new THREE.Color('#f6ecd9')
const PREVIEW_ACCENT = new THREE.Color('#f2c23e')

/** Bake `paletteChannels` (if present) into a `color` vertex attribute. */
function bakeVertexColors(geo: THREE.BufferGeometry): boolean {
  const channels = geo.getAttribute('paletteChannels') as THREE.BufferAttribute | undefined
  if (!channels) return false
  const count = channels.count
  const color = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = channels.getX(i)
    const g = channels.getY(i)
    const b = channels.getZ(i)
    const a = channels.getW(i)
    const rest = Math.max(0, 1 - (r + g + b + a))
    const wr = r + rest
    color[i * 3] = wr * PREVIEW_PRIMARY.r + g * PREVIEW_SECONDARY.r + b * PREVIEW_BELLY.r + a * PREVIEW_ACCENT.r
    color[i * 3 + 1] = wr * PREVIEW_PRIMARY.g + g * PREVIEW_SECONDARY.g + b * PREVIEW_BELLY.g + a * PREVIEW_ACCENT.g
    color[i * 3 + 2] = wr * PREVIEW_PRIMARY.b + g * PREVIEW_SECONDARY.b + b * PREVIEW_BELLY.b + a * PREVIEW_ACCENT.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3))
  return true
}

/**
 * Frame the camera on the MESHES' merged world-space bounding box, not
 * `setFromObject(root)` (the plan-006 framing bug class): procedural part
 * scenes can carry a full skeleton (SkinnedMesh bound to every canonical
 * bone) or, for rigid parts, extra userData — `setFromObject` would zoom out
 * to whatever else is in the scene graph. Traverse meshes only, union their
 * geometry bounding boxes transformed to world space.
 */
function frameOnMeshes(camera: THREE.PerspectiveCamera, root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  let any = false
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geo = mesh.geometry as THREE.BufferGeometry
    if (!geo.boundingBox) geo.computeBoundingBox()
    if (!geo.boundingBox) return
    box.union(geo.boundingBox.clone().applyMatrix4(mesh.matrixWorld))
    any = true
  })
  if (!any) box.set(new THREE.Vector3(-0.1, -0.1, -0.1), new THREE.Vector3(0.1, 0.1, 0.1))
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3()).length() || 0.2
  camera.position.set(center.x + size * 0.7, center.y + size * 0.45, center.z + size * 1.15)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}

/** Render `root` (already populated with meshes+materials) via the shared
 * offscreen renderer, framed on its meshes, and return the data URL. */
function renderRoot(root: THREE.Object3D): string {
  const { renderer, scene, camera } = getShared()
  const holder = new THREE.Group()
  holder.add(root)
  scene.add(holder)
  frameOnMeshes(camera, holder)
  renderer.render(scene, camera)
  const dataUrl = renderer.domElement.toDataURL()
  scene.remove(holder)
  return dataUrl
}

/** Synchronous procedural thumbnail: build the part's own scene, tint each
 * mesh from its `paletteChannels` (falling back to the flat neutral material
 * for meshes with none), render, and return the data URL. */
function renderProceduralThumbnail(build: () => THREE.Object3D): string {
  const root = build()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const tinted = bakeVertexColors(mesh.geometry as THREE.BufferGeometry)
    mesh.material = tinted ? new THREE.MeshToonMaterial({ vertexColors: true, color: '#ffffff' }) : THUMB_MATERIAL
  })
  return renderRoot(root)
}

export function getPartThumbnail(partId: string): Promise<string | null> {
  const def = getPart(partId)
  if (!def) return Promise.resolve(null)
  const key = `${partId}@${meshVersionOf(def)}`
  let pending = cache.get(key)
  if (!pending) {
    if (def.source?.kind === 'procedural') {
      const build = def.source.build
      pending = Promise.resolve()
        .then(() => renderProceduralThumbnail(build))
        .catch(() => null)
    } else if (def.url) {
      pending = renderGlbThumbnail(def.url).catch(() => null)
    } else {
      pending = Promise.resolve(null)
    }
    cache.set(key, pending)
  }
  return pending
}

/** Cached one-shot GLB thumbnail (shared by part + wardrobe pickers). */
export function getGlbThumbnail(cacheKey: string, url: string): Promise<string | null> {
  let pending = cache.get(cacheKey)
  if (!pending) {
    pending = renderGlbThumbnail(url).catch(() => null)
    cache.set(cacheKey, pending)
  }
  return pending
}

async function renderGlbThumbnail(url: string): Promise<string | null> {
  const gltf = await new GLTFLoader().loadAsync(url)
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) mesh.material = THUMB_MATERIAL
  })
  return renderRoot(gltf.scene)
}

/** Clear the thumbnail cache (tests/dev — e.g. after swapping preview palette). */
export function invalidatePartThumbnails(): void {
  cache.clear()
}
