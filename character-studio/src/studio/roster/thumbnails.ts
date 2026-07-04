// Roster thumbnail capture (plan 012 step 2).
//
// REUSES the live Canvas's WebGLRenderer via a temporary WebGLRenderTarget —
// never a second WebGL context (contexts are a scarce browser resource; the
// plan's STOP condition on this is explicit). `ThumbnailCaptureRig` mounts
// once inside <Canvas> (Stage.tsx) and publishes `gl`/`scene`; the actual
// render+readback happens inside a `useFrame` tick so it runs on r3f's own
// render cycle and never races the main draw (we always restore the
// renderer's previous render target before yielding).
//
// Framing: `studioLook.portraitCamera` (the designer's bookmark, plan 010
// step 4) if set, else a bounding-box fit of the ASSEMBLED CHARACTER ROOT
// (published by CharacterRoot via `useMotionStudio` — never the whole
// scene, which would also fit the wide pedestal and light gizmos).

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import type { PortraitCamera } from '../../core/spec/lighting'
import { useMotionStudio } from '../state/studioStores'

const THUMBNAIL_SIZE = 512

interface PendingCapture {
  camera: THREE.PerspectiveCamera
  resolve(blob: Blob | null): void
}

interface ThumbnailRigState {
  gl: THREE.WebGLRenderer | null
  scene: THREE.Scene | null
  pending: PendingCapture | null
}

const useThumbnailRig = create<ThumbnailRigState>(() => ({ gl: null, scene: null, pending: null }))

/** Mount once inside <Canvas> (Stage.tsx). Renders nothing. */
export function ThumbnailCaptureRig() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    useThumbnailRig.setState({ gl, scene })
    return () => useThumbnailRig.setState({ gl: null, scene: null })
  }, [gl, scene])

  useFrame(() => {
    const { pending, gl: renderer, scene: liveScene } = useThumbnailRig.getState()
    if (!pending || !renderer || !liveScene) return
    useThumbnailRig.setState({ pending: null })
    renderThumbnail(renderer, liveScene, pending.camera).then(pending.resolve, () => pending.resolve(null))
  })

  return null
}

function buildPortraitCamera(portrait: PortraitCamera): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(portrait.fov, 1, 0.05, 50)
  camera.position.set(...portrait.position)
  camera.lookAt(...portrait.target)
  camera.updateProjectionMatrix()
  return camera
}

/** Fallback framing when no portrait bookmark is set yet: fit the
 * assembled character's own bounding box. Falls back further to Stage's
 * default Canvas camera pose if no character is assembled at all. */
function buildDefaultCamera(root: THREE.Object3D | null): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50)
  const box = root ? new THREE.Box3().setFromObject(root) : null
  if (box && !box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3()).length() || 1.5
    camera.position.set(center.x, center.y + size * 0.12, center.z + size * 0.95)
    camera.lookAt(center.x, center.y + size * 0.05, center.z)
  } else {
    camera.position.set(0, 1.2, 3.2)
    camera.lookAt(0, 0.7, 0)
  }
  camera.updateProjectionMatrix()
  return camera
}

/** Render `scene` from `camera` into a temporary offscreen target sized
 * `THUMBNAIL_SIZE`², read the pixels back, and hand them to a plain
 * (non-attached) `<canvas>` → PNG blob. Always restores the renderer's
 * previous render target before returning. */
function renderThumbnail(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<Blob | null> {
  const size = THUMBNAIL_SIZE
  const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 })
  const previousTarget = gl.getRenderTarget()
  try {
    gl.setRenderTarget(target)
    gl.render(scene, camera)
  } finally {
    gl.setRenderTarget(previousTarget)
  }

  const pixels = new Uint8Array(size * size * 4)
  gl.readRenderTargetPixels(target, 0, 0, size, size, pixels)
  target.dispose()

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)

  const imageData = ctx.createImageData(size, size)
  const rowBytes = size * 4
  // WebGL reads bottom-up; canvas ImageData rows are top-down.
  for (let y = 0; y < size; y++) {
    const srcStart = (size - 1 - y) * rowBytes
    imageData.data.set(pixels.subarray(srcStart, srcStart + rowBytes), y * rowBytes)
  }
  ctx.putImageData(imageData, 0, 0)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function requestThumbnail(portrait: PortraitCamera | null): Promise<Blob | null> {
  const { gl, scene } = useThumbnailRig.getState()
  if (!gl || !scene) return Promise.resolve(null)
  const root = useMotionStudio.getState().character?.root ?? null
  const camera = portrait ? buildPortraitCamera(portrait) : buildDefaultCamera(root)
  return new Promise((resolve) => {
    useThumbnailRig.setState({ pending: { camera, resolve } })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Capture the current character as a 512² PNG blob. Retries briefly while
 * the viewport hasn't mounted yet or the character hasn't finished
 * assembling (e.g. immediately after "New Character" / import — GLTF loads
 * are async), then makes one best-effort attempt regardless so callers
 * always get a result rather than hanging. Returns `null` only if the
 * viewport genuinely never became available (e.g. running outside a
 * browser, as in tests) — callers should treat that as "keep the previous
 * thumbnail," not an error.
 */
export async function captureThumbnail(
  portrait: PortraitCamera | null,
  options?: { retries?: number; retryDelayMs?: number },
): Promise<Blob | null> {
  const retries = options?.retries ?? 5
  const retryDelayMs = options?.retryDelayMs ?? 200
  for (let attempt = 0; attempt < retries; attempt++) {
    const { gl, scene } = useThumbnailRig.getState()
    const characterReady = useMotionStudio.getState().character !== null
    if (gl && scene && characterReady) return requestThumbnail(portrait)
    await delay(retryDelayMs)
  }
  return requestThumbnail(portrait)
}
