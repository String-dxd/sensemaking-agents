import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { WORLD_ASSETS } from './assets'
import { createButterflies, tickButterflies } from './butterflies'
import { disposeObject3D } from './disposeThree'
import { createFlowers, tickFlowers } from './flowers'
import { attachFruitToTrees } from './fruits'
import { createGrass } from './grass'
import {
  findWorldHotspot,
  findWorldHotspotPriority,
  type WorldHotspot,
  type WorldHotspotPointer,
} from './hotspots'
import { createIsland } from './island'
import { createSkyBackdrop, tickSkyBackdrop } from './sky'
import { createValueTree, tickStudentSpaceTrees } from './trees'
import type { VipsWorldSceneModel } from './vipsWorldMapping'
import { buildVipsWorldSceneModel } from './vipsWorldMapping'

export interface CreateWorldSceneOptions {
  container: HTMLElement
  model?: VipsWorldSceneModel
  reduceMotion?: boolean
  onHotspotHover?: (hotspot: WorldHotspot | null, pointer?: WorldHotspotPointer) => void
  onHotspotSelect?: (hotspot: WorldHotspot) => void
}

export interface WorldSceneHandle {
  renderNow: () => void
  dispose: () => void
}

export function createWorldScene({
  container,
  model = buildVipsWorldSceneModel(),
  reduceMotion = false,
  onHotspotHover,
  onHotspotSelect,
}: CreateWorldSceneOptions): WorldSceneHandle {
  assertWebGlAvailable()

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.setAttribute('data-testid', 'world-scene-canvas')
  renderer.domElement.setAttribute('aria-hidden', 'true')
  renderer.domElement.style.position = 'absolute'
  renderer.domElement.style.inset = '0'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.pointerEvents = 'auto'
  renderer.domElement.style.touchAction = 'none'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120)
  const cameraTarget = new THREE.Vector3(0, 0.95, 0)
  camera.position.set(0, 6.3, 12.8)
  const cameraRadius = Math.hypot(
    camera.position.y - cameraTarget.y,
    camera.position.z - cameraTarget.z,
  )
  let cameraPitch = Math.atan2(camera.position.y - cameraTarget.y, camera.position.z)
  const applyCameraPitch = () => {
    cameraPitch = THREE.MathUtils.clamp(cameraPitch, 0.2, 0.82)
    camera.position.set(
      0,
      cameraTarget.y + Math.sin(cameraPitch) * cameraRadius,
      Math.cos(cameraPitch) * cameraRadius,
    )
    camera.lookAt(cameraTarget)
  }
  applyCameraPitch()

  const sky = createSkyBackdrop(model.terrain)
  scene.add(sky)
  scene.fog = new THREE.Fog(0x7fd0ff, 22, 58)
  const ambient = new THREE.HemisphereLight(0xfff4d0, 0x78c879, 1.65)
  scene.add(ambient)
  const key = new THREE.DirectionalLight(0xfff0bc, 1.35)
  key.position.set(7, 11, 5)
  scene.add(key)

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75))
  const renderPass = new RenderPass(scene, camera)
  const handheldPass = new ShaderPass(ANIMAL_CROSSING_3DS_SHADER)
  const outputPass = new OutputPass()
  composer.addPass(renderPass)
  composer.addPass(handheldPass)
  composer.addPass(outputPass)

  const worldRoot = new THREE.Group()
  worldRoot.name = 'vips-world-root'
  worldRoot.scale.setScalar(0.72)
  worldRoot.rotation.x = -0.03
  scene.add(worldRoot)

  const textureLoader = new THREE.TextureLoader()
  const foliageTexture = textureLoader.load(WORLD_ASSETS.textures.foliageSdf.url)
  foliageTexture.magFilter = THREE.LinearFilter
  foliageTexture.minFilter = THREE.LinearFilter
  foliageTexture.generateMipmaps = false
  foliageTexture.wrapS = THREE.RepeatWrapping
  foliageTexture.wrapT = THREE.RepeatWrapping

  worldRoot.add(createIsland(model.terrain))
  worldRoot.add(createGrass())
  for (const tree of model.trees) {
    const treeGroup = createValueTree(tree, foliageTexture)
    worldRoot.add(treeGroup)
  }
  worldRoot.add(createFlowers(model.flowers))
  attachFruitToTrees(worldRoot, model.fruit, model.trees)
  const butterflies = createButterflies(model.butterflies)
  worldRoot.add(butterflies)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let cameraPitchDrag: {
    pointerId: number
    startY: number
    startPitch: number
    moved: boolean
  } | null = null
  let suppressNextClick = false

  const renderInteractiveFrame = () => {
    setHandheldTime(handheldPass, performance.now() * 0.001)
    composer.render()
  }

  const hotspotAt = (event: PointerEvent | MouseEvent): WorldHotspot | null => {
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const intersections = raycaster.intersectObjects(worldRoot.children, true)
    let best: { hotspot: WorldHotspot; score: number } | null = null
    for (const intersection of intersections) {
      const hotspot = findWorldHotspot(intersection.object)
      if (!hotspot) continue
      const priority = findWorldHotspotPriority(intersection.object)
      const score = priority - intersection.distance * 0.002
      if (!best || score > best.score) best = { hotspot, score }
    }
    return best?.hotspot ?? null
  }

  const pointerPosition = (event: PointerEvent | MouseEvent): WorldHotspotPointer => {
    const rect = renderer.domElement.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (cameraPitchDrag) {
      const deltaY = event.clientY - cameraPitchDrag.startY
      if (Math.abs(deltaY) > 3) cameraPitchDrag.moved = true
      cameraPitch = cameraPitchDrag.startPitch - deltaY * 0.0038
      applyCameraPitch()
      renderer.domElement.style.cursor = 'ns-resize'
      onHotspotHover?.(null)
      renderInteractiveFrame()
      event.preventDefault()
      return
    }

    const hotspot = hotspotAt(event)
    renderer.domElement.style.cursor = hotspot ? 'pointer' : 'default'
    onHotspotHover?.(hotspot, hotspot ? pointerPosition(event) : undefined)
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    cameraPitchDrag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPitch: cameraPitch,
      moved: false,
    }
    suppressNextClick = false
    renderer.domElement.setPointerCapture(event.pointerId)
    renderer.domElement.style.cursor = 'ns-resize'
  }

  const finishCameraPitchDrag = (event: PointerEvent) => {
    if (!cameraPitchDrag || cameraPitchDrag.pointerId !== event.pointerId) return
    suppressNextClick = cameraPitchDrag.moved
    cameraPitchDrag = null
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId)
    }
    renderer.domElement.style.cursor = 'default'
  }

  const handlePointerLeave = () => {
    if (cameraPitchDrag) return
    renderer.domElement.style.cursor = 'default'
    onHotspotHover?.(null)
  }

  const handleClick = (event: MouseEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false
      return
    }
    const hotspot = hotspotAt(event)
    if (hotspot) onHotspotSelect?.(hotspot)
  }

  let frameId = 0
  let disposed = false
  let lastTime = 0

  const resize = () => {
    const rect = container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    renderer.setSize(width, height, false)
    composer.setSize(width, height)
    setHandheldResolution(handheldPass, width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const renderNow = () => {
    resize()
    setHandheldTime(handheldPass, performance.now() * 0.001)
    composer.render()
  }

  const animate = (time: number) => {
    if (disposed) return
    const delta = Math.min(32, time - lastTime)
    lastTime = time
    worldRoot.rotation.y += delta * 0.000016
    const elapsed = time * 0.001
    const sunDir = key.position.clone().normalize()
    tickStudentSpaceTrees(worldRoot, elapsed, sunDir)
    tickFlowers(worldRoot, elapsed)
    tickButterflies(butterflies, elapsed)
    tickSkyBackdrop(sky, elapsed)
    setHandheldTime(handheldPass, elapsed)
    worldRoot.traverse((object) => {
      const material = object.userData.worldAnimatedMaterial
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uTime) {
        material.uniforms.uTime.value = elapsed
      }
    })
    composer.render()
    frameId = requestAnimationFrame(animate)
  }

  const resizeObserver = new ResizeObserver(renderNow)
  resizeObserver.observe(container)
  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerup', finishCameraPitchDrag)
  renderer.domElement.addEventListener('pointercancel', finishCameraPitchDrag)
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
  renderer.domElement.addEventListener('click', handleClick)
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
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', finishCameraPitchDrag)
      renderer.domElement.removeEventListener('pointercancel', finishCameraPitchDrag)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('click', handleClick)
      disposeObject3D(scene)
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

function setHandheldResolution(pass: ShaderPass, width: number, height: number) {
  const uniform = pass.uniforms.uResolution
  if (uniform?.value instanceof THREE.Vector2) uniform.value.set(width, height)
}

function setHandheldTime(pass: ShaderPass, time: number) {
  const uniform = pass.uniforms.uTime
  if (uniform) uniform.value = time
}

const ANIMAL_CROSSING_3DS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float barrel = dot(centered, centered) * 0.018;
      uv = centered * (1.0 + barrel) + 0.5;

      vec4 tex = texture2D(tDiffuse, uv);
      vec3 color = tex.rgb;
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(luma), color, 1.08);
      color = pow(max(color, vec3(0.0)), vec3(1.04));
      color = (color - 0.5) * 1.0 + 0.5;
      color += vec3(-0.024, -0.02, -0.008);

      float scanline = sin((vUv.y * uResolution.y + uTime * 7.0) * 1.45) * 0.006;
      color += scanline;

      float vignette = smoothstep(0.74, 0.22, length(centered));
      color *= mix(0.82, 0.98, vignette);
      color = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(color, tex.a);
    }
  `,
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
