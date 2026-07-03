// Lazy offscreen part thumbnails (plan 006 step 5): each part GLB is loaded
// and rendered ONCE to a small offscreen canvas; the data URL is cached for
// the session. The renderer is shared and sized 96×96 — cost is one render
// per part id, on first sight in the picker.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getPart } from '../../core/skeleton/partRegistry'

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

export function getPartThumbnail(partId: string): Promise<string | null> {
  let pending = cache.get(partId)
  if (!pending) {
    pending = renderThumbnail(partId).catch(() => null)
    cache.set(partId, pending)
  }
  return pending
}

async function renderThumbnail(partId: string): Promise<string | null> {
  const def = getPart(partId)
  if (!def?.url) return null
  const gltf = await new GLTFLoader().loadAsync(def.url)
  const { renderer, scene, camera } = getShared()

  const holder = new THREE.Group()
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) mesh.material = THUMB_MATERIAL
  })
  holder.add(gltf.scene)
  scene.add(holder)

  const box = new THREE.Box3().setFromObject(holder)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3()).length() || 0.2
  camera.position.set(center.x + size * 0.7, center.y + size * 0.45, center.z + size * 1.15)
  camera.lookAt(center)
  camera.updateProjectionMatrix()

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL()
  scene.remove(holder)
  return url
}
