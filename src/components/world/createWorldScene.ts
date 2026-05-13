import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { WORLD_ASSETS, type WorldAssetEntry } from './assets'
import { createButterflies } from './butterflies'
import { disposeObject3D } from './disposeThree'
import { createFlowers } from './flowers'
import { attachFruitToTrees } from './fruits'
import { createIsland } from './island'
import { createSkyBackdrop } from './sky'
import { approvedTreeAssetFor, createValueTree } from './trees'
import type { VipsWorldSceneModel } from './vipsWorldMapping'
import { buildVipsWorldSceneModel } from './vipsWorldMapping'

export interface CreateWorldSceneOptions {
  container: HTMLElement
  model?: VipsWorldSceneModel
  reduceMotion?: boolean
}

export interface WorldSceneHandle {
  renderNow: () => void
  dispose: () => void
}

export function createWorldScene({
  container,
  model = buildVipsWorldSceneModel(),
  reduceMotion = false,
}: CreateWorldSceneOptions): WorldSceneHandle {
  assertWebGlAvailable()

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75))
  renderer.domElement.setAttribute('data-testid', 'world-scene-canvas')
  renderer.domElement.setAttribute('aria-hidden', 'true')
  renderer.domElement.style.position = 'absolute'
  renderer.domElement.style.inset = '0'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.pointerEvents = 'none'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)
  camera.position.set(0, 5.4, 9.6)
  camera.lookAt(0, 0, 0)

  scene.add(createSkyBackdrop(model.terrain))
  const ambient = new THREE.HemisphereLight(0xfaf7e8, 0x8fae9b, 2.2)
  scene.add(ambient)
  const key = new THREE.DirectionalLight(0xfff0c8, 2.1)
  key.position.set(2, 5, 4)
  scene.add(key)

  const worldRoot = new THREE.Group()
  worldRoot.name = 'vips-world-root'
  worldRoot.scale.setScalar(0.78)
  worldRoot.rotation.x = -0.08
  scene.add(worldRoot)

  const textureLoader = new THREE.TextureLoader()
  const foliageTexture = textureLoader.load(WORLD_ASSETS.textures.foliageSdf.url)
  foliageTexture.colorSpace = THREE.SRGBColorSpace

  worldRoot.add(createIsland(model.terrain))
  for (const tree of model.trees) {
    const treeGroup = createValueTree(tree, foliageTexture)
    worldRoot.add(treeGroup)
    const asset = approvedTreeAssetFor(tree)
    if (asset) {
      void loadApprovedTreeAsset(asset, treeGroup)
    }
  }
  worldRoot.add(createFlowers(model.flowers))
  attachFruitToTrees(worldRoot, model.fruit, model.trees)
  const butterflies = createButterflies(model.butterflies)
  worldRoot.add(butterflies)

  let frameId = 0
  let disposed = false
  let lastTime = 0

  const resize = () => {
    const rect = container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const renderNow = () => {
    resize()
    renderer.render(scene, camera)
  }

  const animate = (time: number) => {
    if (disposed) return
    const delta = Math.min(32, time - lastTime)
    lastTime = time
    worldRoot.rotation.y += delta * 0.000035
    butterflies.children.forEach((child, index) => {
      child.position.y += Math.sin(time * 0.0015 + index) * 0.0008
      child.rotation.y = Math.sin(time * 0.002 + index) * 0.18
    })
    renderer.render(scene, camera)
    frameId = requestAnimationFrame(animate)
  }

  const resizeObserver = new ResizeObserver(renderNow)
  resizeObserver.observe(container)
  renderNow()
  if (!reduceMotion) {
    frameId = requestAnimationFrame(animate)
  }

  return {
    renderNow,
    dispose: () => {
      disposed = true
      if (frameId) cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      disposeObject3D(scene)
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

async function loadApprovedTreeAsset(asset: WorldAssetEntry, target: THREE.Object3D) {
  const loader = new GLTFLoader()
  try {
    const gltf = await loader.loadAsync(asset.url)
    const model = gltf.scene
    model.name = `${target.name}-approved-asset`
    model.scale.setScalar(0.34)
    model.position.set(0, 0.02, 0)
    target.add(model)
  } catch {
    // Procedural tree remains visible when a GLB fails or needs a decoder.
  }
}

function assertWebGlAvailable() {
  const canvas = document.createElement('canvas')
  const context =
    canvas.getContext('webgl2') ??
    canvas.getContext('webgl') ??
    canvas.getContext('experimental-webgl')
  if (!context) {
    throw new Error('WebGL is not available')
  }
}
