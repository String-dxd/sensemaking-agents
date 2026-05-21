import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { WORLD_ASSETS } from './assets'
import { createButterflies, tickButterflies } from './butterflies'
import { disposeObject3D } from './disposeThree'
import { createFlowers, tickFlowers } from './flowers'
import { attachFruitToTrees } from './fruits'
import { createGrass } from './grass'
import {
  findWorldHotspotOwner,
  findWorldHotspotPriority,
  type WorldHotspot,
  type WorldHotspotPointer,
} from './hotspots'
import { createIsland, islandHeightAt } from './island'
import { createMailbox, tickMailbox } from './mailbox'
import { createMoodPins, tickMoodPins } from './moodPins'
import { createPromptBird, pickPromptBirdPrompt, tickPromptBird } from './promptBird'
import { createAuroraEffect, tickAuroraEffect } from './sceneEffects/aurora'
import { createAmbientFireflies, tickAmbientFireflies } from './sceneEffects/fireflies'
import { createAmbientParticles, tickAmbientParticles } from './sceneEffects/particles'
import { StudentSpaceRainEffect } from './sceneEffects/rain'
import { createRainbowEffect, tickRainbowEffect } from './sceneEffects/rainbow'
import { createStarsEffect, tickStarsEffect } from './sceneEffects/stars'
import { createWeatherScene, tickWeatherScene } from './sceneEffects/weather'
import { createSkyBackdrop, tickSkyBackdrop } from './sky'
import { createValueTree, STUDENT_SPACE_TREE_PLACEMENTS, tickStudentSpaceTrees } from './trees'
import type { VipsWorldSceneModel } from './vipsWorldMapping'
import { buildVipsWorldSceneModel } from './vipsWorldMapping'
import {
  DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
  WORLD_STYLE,
  type WorldEnvironmentControls,
  worldMotionScale,
  worldWeatherAtElapsed,
} from './worldStyle'

const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 1.7, 0)
const DEFAULT_CAMERA_DISTANCE = 17.5
const DEFAULT_CAMERA_PITCH = THREE.MathUtils.degToRad(28)
const ZOOM_STEP_IN = 0.85
const ZOOM_STEP_OUT = 1 / ZOOM_STEP_IN
const HOVER_RING_COLOR = 0xffe9c2
const HOVER_RING_PULSE_HZ = 0.9
const HOTSPOT_FOCUS_DURATION = 600

export interface CreateWorldSceneOptions {
  container: HTMLElement
  model?: VipsWorldSceneModel
  environmentControls?: WorldEnvironmentControls
  reduceMotion?: boolean
  onHotspotHover?: (hotspot: WorldHotspot | null, pointer?: WorldHotspotPointer) => void
  onHotspotSelect?: (hotspot: WorldHotspot) => void
}

export interface WorldSceneHandle {
  renderNow: () => void
  resetCamera: (duration?: number) => void
  restoreCamera: (duration?: number) => void
  updateEnvironmentControls: (controls: WorldEnvironmentControls) => void
  zoomBy: (factor: number) => void
  dispose: () => void
}

interface WorldHotspotPick {
  hotspot: WorldHotspot
  object: THREE.Object3D
  point: THREE.Vector3
  groundPoint: THREE.Vector3
  score: number
}

export function createWorldScene({
  container,
  model = buildVipsWorldSceneModel(),
  environmentControls = DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
  reduceMotion = false,
  onHotspotHover,
  onHotspotSelect,
}: CreateWorldSceneOptions): WorldSceneHandle {
  assertWebGlAvailable()
  const motionScale = worldMotionScale(reduceMotion)
  let activeEnvironmentControls = environmentControls
  const sceneModel = withStudentSpaceBaseline(model)

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.LinearToneMapping
  renderer.toneMappingExposure = 1.08
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
  const cameraTarget = DEFAULT_CAMERA_TARGET.clone()
  const cameraPitch = DEFAULT_CAMERA_PITCH
  const cameraDistance = DEFAULT_CAMERA_DISTANCE
  camera.position.set(
    0,
    cameraTarget.y + Math.sin(cameraPitch) * cameraDistance,
    Math.cos(cameraPitch) * cameraDistance,
  )
  camera.lookAt(cameraTarget)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.copy(cameraTarget)
  controls.minDistance = 6
  controls.maxDistance = 30
  controls.maxPolarAngle = Math.PI * 0.495
  controls.update()
  let cameraTransition: CameraTransitionState | null = null
  let cameraRestorePoint: CameraRestorePoint | null = null

  const sky = createSkyBackdrop()
  scene.add(sky)
  scene.fog = new THREE.Fog(0x7fd0ff, 22, 58)
  const ambient = new THREE.HemisphereLight(0xfff4d0, 0x78c879, 1.65)
  scene.add(ambient)
  const key = new THREE.DirectionalLight(0xfff0bc, 1.35)
  key.position.set(-6, 12, 7)
  scene.add(key)

  const stageRoot = new THREE.Group()
  stageRoot.name = 'vips-world-stage-root'
  scene.add(stageRoot)

  const islandRoot = new THREE.Group()
  islandRoot.name = 'vips-world-island-root'
  stageRoot.add(islandRoot)

  const textureLoader = new THREE.TextureLoader()
  const foliageTexture = textureLoader.load(WORLD_ASSETS.textures.foliageSdf.url)
  foliageTexture.magFilter = THREE.LinearFilter
  foliageTexture.minFilter = THREE.LinearFilter
  foliageTexture.generateMipmaps = false
  foliageTexture.wrapS = THREE.RepeatWrapping
  foliageTexture.wrapT = THREE.RepeatWrapping

  islandRoot.add(createIsland(sceneModel.terrain))
  islandRoot.add(createGrass())
  for (const [index, tree] of sceneModel.trees.entries()) {
    const placement =
      index < STUDENT_SPACE_TREE_PLACEMENTS.length
        ? STUDENT_SPACE_TREE_PLACEMENTS[index]
        : undefined
    const treeGroup = createValueTree(tree, foliageTexture, placement)
    islandRoot.add(treeGroup)
  }
  const flowers = createFlowers(sceneModel.flowers)
  islandRoot.add(flowers)
  attachFruitToTrees(islandRoot, sceneModel.fruit, sceneModel.trees, foliageTexture)
  const butterflies = createButterflies(sceneModel.butterflies)
  islandRoot.add(butterflies)
  const promptBird = createPromptBird(pickPromptBirdPrompt())
  islandRoot.add(promptBird)
  const mailbox = createMailbox(sceneModel.mailbox)
  islandRoot.add(mailbox)
  const moodPins = createMoodPins(sceneModel.moodPins)
  islandRoot.add(moodPins)
  const effectsRoot = new THREE.Group()
  effectsRoot.name = 'student-space-scene-effects'
  const rainbowEffect = createRainbowEffect()
  const rainEffect = new StudentSpaceRainEffect()
  const starsEffect = createStarsEffect()
  const ambientFireflies = createAmbientFireflies(motionScale)
  effectsRoot.add(createWeatherScene())
  effectsRoot.add(rainbowEffect)
  effectsRoot.add(createAmbientParticles(motionScale))
  effectsRoot.add(createAuroraEffect(motionScale))
  effectsRoot.add(starsEffect)
  effectsRoot.add(ambientFireflies)
  scene.add(effectsRoot)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const screenProjection = new THREE.Vector3()
  const hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.55, 36, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: HOVER_RING_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  hoverRing.name = 'student-space-hover-ring'
  hoverRing.renderOrder = 5
  hoverRing.visible = false
  scene.add(hoverRing)
  let activeHoverPick: WorldHotspotPick | null = null

  const pickHotspot = (event: PointerEvent | MouseEvent): WorldHotspotPick | null => {
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const intersections = raycaster.intersectObjects(islandRoot.children, true)
    let best: WorldHotspotPick | null = null
    for (const intersection of intersections) {
      const owner = findWorldHotspotOwner(intersection.object)
      if (!owner) continue
      const priority = findWorldHotspotPriority(intersection.object)
      const score = priority - intersection.distance * 0.002
      const ownerPosition = new THREE.Vector3()
      owner.object.getWorldPosition(ownerPosition)
      const x = Number.isFinite(ownerPosition.x) ? ownerPosition.x : intersection.point.x
      const z = Number.isFinite(ownerPosition.z) ? ownerPosition.z : intersection.point.z
      const y = islandHeightAt(x, z) + 0.025
      if (!best || score > best.score) {
        best = {
          hotspot: owner.hotspot,
          object: owner.object,
          point: intersection.point.clone(),
          groundPoint: new THREE.Vector3(x, y, z),
          score,
        }
      }
    }
    return best
  }

  const hotspotScreenPosition = (pick: WorldHotspotPick): WorldHotspotPointer => {
    const rect = renderer.domElement.getBoundingClientRect()
    screenProjection
      .copy(pick.groundPoint)
      .add(new THREE.Vector3(0, hoverScreenLiftForHotspot(pick.hotspot.kind), 0))
      .project(camera)
    return {
      x: (screenProjection.x * 0.5 + 0.5) * rect.width,
      y: (-screenProjection.y * 0.5 + 0.5) * rect.height,
    }
  }

  const setHoverPick = (pick: WorldHotspotPick | null) => {
    const previousPick = activeHoverPick
    const sameHotspot = pick != null && pick.hotspot.id === previousPick?.hotspot.id
    activeHoverPick = pick

    if (!pick) {
      if (!previousPick) return
      renderer.domElement.style.cursor = 'default'
      hoverRing.visible = false
      const material = hoverRing.material
      if (material instanceof THREE.MeshBasicMaterial) material.opacity = 0
      onHotspotHover?.(null)
      return
    }

    renderer.domElement.style.cursor = 'pointer'
    hoverRing.position.copy(pick.groundPoint)
    hoverRing.scale.setScalar(hoverRingScaleForHotspot(pick.hotspot.kind))
    hoverRing.visible = true
    const material = hoverRing.material
    if (material instanceof THREE.MeshBasicMaterial) material.opacity = 0.68

    if (!sameHotspot) {
      onHotspotHover?.(pick.hotspot, hotspotScreenPosition(pick))
    }
  }

  const tickHoverRing = (elapsed: number) => {
    if (!activeHoverPick || !hoverRing.visible) return
    const material = hoverRing.material
    if (!(material instanceof THREE.MeshBasicMaterial)) return
    material.opacity = 0.55 + 0.25 * Math.sin(elapsed * Math.PI * 2 * HOVER_RING_PULSE_HZ)
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    setHoverPick(pickHotspot(event))
  }

  const handlePointerLeave = () => {
    setHoverPick(null)
  }

  let pointerDownPosition: { x: number; y: number } | null = null

  const handlePointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return
    pointerDownPosition = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (!pointerDownPosition) return
    const dragDistance = Math.hypot(
      event.clientX - pointerDownPosition.x,
      event.clientY - pointerDownPosition.y,
    )
    pointerDownPosition = null
    if (dragDistance > 6) {
      renderer.domElement.style.cursor = 'default'
      setHoverPick(null)
      return
    }
    const pick = pickHotspot(event)
    if (!pick) {
      setHoverPick(null)
      return
    }
    if (event.pointerType === 'touch' && activeHoverPick?.hotspot.id !== pick.hotspot.id) {
      setHoverPick(pick)
      return
    }
    setHoverPick(pick)
    focusCameraOnPick(pick)
    setHoverPick(null)
    onHotspotSelect?.(pick.hotspot)
  }

  let frameId = 0
  let disposed = false
  let lastTime = 0
  let oceanTime = 0

  const resize = () => {
    const rect = container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    tickCameraTransition()
    controls.update()
  }

  const zoomBy = (factor: number) => {
    if (cameraTransition) return
    const offset = camera.position.clone().sub(controls.target)
    const nextDistance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    )
    offset.setLength(nextDistance)
    camera.position.copy(controls.target).add(offset)
    controls.update()
    renderNow()
  }

  const resetCamera = (duration = 600) => {
    cameraRestorePoint = null
    const endTarget = DEFAULT_CAMERA_TARGET.clone()
    const endPosition = new THREE.Vector3(
      0,
      endTarget.y + Math.sin(DEFAULT_CAMERA_PITCH) * DEFAULT_CAMERA_DISTANCE,
      Math.cos(DEFAULT_CAMERA_PITCH) * DEFAULT_CAMERA_DISTANCE,
    )
    transitionCameraTo(endPosition, endTarget, duration)
  }

  const restoreCamera = (duration = 600) => {
    const restorePoint = cameraRestorePoint
    cameraRestorePoint = null
    if (!restorePoint) {
      resetCamera(duration)
      return
    }
    transitionCameraTo(restorePoint.position, restorePoint.target, duration)
  }

  const transitionCameraTo = (
    endPosition: THREE.Vector3,
    endTarget: THREE.Vector3,
    duration: number,
  ) => {
    if (reduceMotion || duration <= 0) {
      cameraTransition = null
      controls.enabled = true
      camera.position.copy(endPosition)
      controls.target.copy(endTarget)
      controls.update()
      renderNow()
      return
    }
    cameraTransition = {
      startPosition: camera.position.clone(),
      endPosition,
      startTarget: controls.target.clone(),
      endTarget,
      startTime: performance.now(),
      duration,
    }
    controls.enabled = false
    renderNow()
  }

  const focusCameraOnPick = (pick: WorldHotspotPick, duration = HOTSPOT_FOCUS_DURATION) => {
    if (!cameraRestorePoint && !cameraTransition) {
      cameraRestorePoint = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      }
    }
    const base = pick.groundPoint
    const target = base
      .clone()
      .add(new THREE.Vector3(0, cameraTargetLiftForHotspot(pick.hotspot.kind), 0))
    const fromTarget = camera.position.clone().sub(base)
    const flatLength = Math.hypot(fromTarget.x, fromTarget.z) || 1
    const unitX = fromTarget.x / flatLength
    const unitZ = fromTarget.z / flatLength
    const distance = cameraDistanceForHotspot(pick.hotspot.kind)
    const endPosition = new THREE.Vector3(
      base.x + unitX * distance,
      base.y + cameraLiftForHotspot(pick.hotspot.kind),
      base.z + unitZ * distance,
    )
    transitionCameraTo(endPosition, target, duration)
  }

  const tickCameraTransition = () => {
    if (!cameraTransition) return false
    const t = Math.min(
      1,
      (performance.now() - cameraTransition.startTime) / cameraTransition.duration,
    )
    const eased = smootherstep(t)
    camera.position.lerpVectors(cameraTransition.startPosition, cameraTransition.endPosition, eased)
    controls.target.lerpVectors(cameraTransition.startTarget, cameraTransition.endTarget, eased)
    camera.lookAt(controls.target)
    if (t >= 1) {
      cameraTransition = null
      controls.enabled = true
      controls.update()
    }
    return true
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return
    if (event.key === '+' || event.key === '=') {
      zoomBy(ZOOM_STEP_IN)
      event.preventDefault()
    } else if (event.key === '-' || event.key === '_') {
      zoomBy(ZOOM_STEP_OUT)
      event.preventDefault()
    } else if (event.key === '0') {
      resetCamera()
      event.preventDefault()
    }
  }

  const renderNow = () => {
    resize()
    const weather = worldWeatherAtElapsed(0, activeEnvironmentControls)
    applyWeatherLighting(scene, ambient, key, 0, activeEnvironmentControls)
    rainEffect.update(0, weather)
    tickRainbowEffect(rainbowEffect, weather.rainbow)
    tickWeatherScene(effectsRoot, 0, activeEnvironmentControls)
    tickStarsEffect(starsEffect, 0, activeEnvironmentControls)
    tickAmbientFireflies(ambientFireflies, 0, activeEnvironmentControls)
    for (const effect of effectsRoot.children) {
      tickAuroraEffect(effect, 0, activeEnvironmentControls)
    }
    renderer.render(scene, camera)
    rainEffect.render(renderer)
  }

  const animate = (time: number) => {
    if (disposed) return
    const delta = Math.min(32, time - lastTime)
    lastTime = time
    tickCameraTransition()
    controls.update()
    const elapsed = time * 0.001
    tickHoverRing(elapsed)
    const weather = worldWeatherAtElapsed(elapsed, activeEnvironmentControls)
    oceanTime +=
      (delta / 1000) *
      (WORLD_STYLE.island.oceanClockBase + weather.rain * WORLD_STYLE.island.oceanClockRainScale)
    tickButterflies(butterflies, elapsed, motionScale, activeEnvironmentControls)
    tickFlowers(flowers, elapsed)
    tickPromptBird(promptBird, elapsed, motionScale)
    tickMailbox(mailbox, elapsed, motionScale)
    tickMoodPins(moodPins, elapsed, motionScale)
    tickSkyBackdrop()
    const grassElapsed = elapsed * WORLD_STYLE.motion.grassWindSpeed
    const treeElapsed = elapsed * WORLD_STYLE.motion.treeWindSpeed
    const windGust = studentSpaceWindGust(treeElapsed) * WORLD_STYLE.motion.grassWindAmplitude
    tickStudentSpaceTrees(
      islandRoot,
      treeElapsed,
      key.position.clone().normalize(),
      windGust,
      WORLD_STYLE.motion.leafFlutter,
    )
    tickAmbientParticles(effectsRoot, elapsed)
    tickWeatherScene(effectsRoot, elapsed, activeEnvironmentControls)
    tickRainbowEffect(rainbowEffect, weather.rainbow)
    rainEffect.update(delta / 1000, weather)
    applyWeatherLighting(scene, ambient, key, elapsed, activeEnvironmentControls)
    tickStarsEffect(starsEffect, elapsed, activeEnvironmentControls)
    tickAmbientFireflies(ambientFireflies, elapsed, activeEnvironmentControls)
    for (const effect of effectsRoot.children) {
      tickAuroraEffect(effect, elapsed, activeEnvironmentControls)
    }
    islandRoot.traverse((object) => {
      const material = object.userData.worldAnimatedMaterial
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uTime) {
        if (object.userData.worldAnimatedKind === 'ocean') {
          material.uniforms.uTime.value = oceanTime
        } else if (object.userData.worldAnimatedKind === 'grass') {
          material.uniforms.uTime.value = grassElapsed
        } else {
          material.uniforms.uTime.value = elapsed
        }
      }
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uRain) {
        material.uniforms.uRain.value = weather.rain
      }
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uSunPosition) {
        material.uniforms.uSunPosition.value.copy(key.position).normalize()
      }
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uSkyTint) {
        material.uniforms.uSkyTint.value.setRGB(...rgb01(weather.skyBottom))
      }
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uWindGust) {
        material.uniforms.uWindGust.value = windGust
      }
    })
    renderer.render(scene, camera)
    rainEffect.render(renderer)
    frameId = requestAnimationFrame(animate)
  }

  const resizeObserver = new ResizeObserver(renderNow)
  resizeObserver.observe(container)
  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerup', handlePointerUp)
  renderer.domElement.addEventListener('pointercancel', handlePointerUp)
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
  window.addEventListener('keydown', handleKeyDown)
  renderNow()
  if (!reduceMotion) {
    frameId = requestAnimationFrame(animate)
  }

  return {
    renderNow,
    resetCamera,
    restoreCamera,
    updateEnvironmentControls: (controls) => {
      activeEnvironmentControls = controls
      renderNow()
    },
    zoomBy,
    dispose: () => {
      disposed = true
      if (frameId) cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      window.removeEventListener('keydown', handleKeyDown)
      disposeObject3D(scene)
      rainEffect.dispose()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

export function withStudentSpaceBaseline(model: VipsWorldSceneModel): VipsWorldSceneModel {
  const sourceTrees = [...model.trees]
  for (let index = 0; index < STUDENT_SPACE_TREE_PLACEMENTS.length; index += 1) {
    const placement = STUDENT_SPACE_TREE_PLACEMENTS[index]
    if (sourceTrees[index]) continue
    if (!placement) continue
    sourceTrees.push(
      baselineTree(
        `student-space-${placement.species}-${index}`,
        `student-space.decorative.tree.${index}`,
        placement.species,
        placement.species,
        100 + index * 41,
      ),
    )
  }

  if (model.flowers.length > 0 || model.fruit.length > 0) {
    return {
      ...model,
      trees: sourceTrees,
    }
  }

  return {
    ...model,
    trees: sourceTrees,
    flowers: [
      baselineFlower('student-space-daisy', 'interests.realistic', 'Realistic', 'daisy', 41),
      baselineFlower('student-space-tulip', 'interests.enterprising', 'Enterprising', 'tulip', 88),
      baselineFlower('student-space-rose', 'interests.artistic', 'Artistic', 'rose', 131),
      baselineFlower('student-space-lily', 'interests.social', 'Social', 'lily', 179),
      baselineFlower(
        'student-space-pansy',
        'interests.investigative',
        'Investigative',
        'pansy',
        245,
      ),
      baselineFlower(
        'student-space-hyacinth',
        'interests.conventional',
        'Conventional',
        'hyacinth',
        317,
      ),
    ],
  }
}

function baselineTree(
  id: string,
  claimId: string,
  label: string,
  species: VipsWorldSceneModel['trees'][number]['species'],
  placementSeed: number,
): VipsWorldSceneModel['trees'][number] {
  return {
    id,
    claimId,
    label,
    species,
    color: species === 'cherry' ? '#f08fab' : '#7fa45d',
    shape: 'student-space-baseline',
    strength: 'medium',
    evidenceState: 'confirmed',
    evidenceCount: 1,
    placementSeed,
    timelineEntryIds: [],
  }
}

function baselineFlower(
  id: string,
  claimId: string,
  label: string,
  flower: VipsWorldSceneModel['flowers'][number]['flower'],
  placementSeed: number,
): VipsWorldSceneModel['flowers'][number] {
  return {
    id,
    claimId,
    label,
    flower,
    color: '#ffffff',
    strength: 'medium',
    evidenceState: 'confirmed',
    count: 2,
    placementSeed,
    timelineEntryIds: [],
  }
}

function rgb01(rgb: readonly [number, number, number]): [number, number, number] {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
}

function studentSpaceWindGust(elapsed: number): number {
  const a = Math.sin(elapsed * 0.18) * 0.5 + 0.5
  const b = Math.sin(elapsed * 0.43 + 1.7) * 0.5 + 0.5
  const mix = a * 0.65 + b * 0.35
  return 0.35 + mix * 0.65
}

function hoverRingScaleForHotspot(kind: WorldHotspot['kind']): number {
  if (kind === 'value') return 1.6
  if (kind === 'interest') return 0.65
  if (kind === 'skill') return 0.55
  if (kind === 'prompt') return 1
  if (kind === 'mailbox') return 0.85
  if (kind === 'mood') return 0.55
  return 0.7
}

function hoverScreenLiftForHotspot(kind: WorldHotspot['kind']): number {
  if (kind === 'value') return 1.8
  if (kind === 'skill') return 0.45
  if (kind === 'prompt') return 0.75
  if (kind === 'mailbox') return 1.35
  if (kind === 'reflection') return 0.35
  return 0.28
}

function cameraDistanceForHotspot(kind: WorldHotspot['kind']): number {
  if (kind === 'value') return 4
  if (kind === 'prompt') return 2.8
  if (kind === 'mailbox') return 3.1
  return 3.4
}

function cameraLiftForHotspot(kind: WorldHotspot['kind']): number {
  if (kind === 'value') return 2.25
  if (kind === 'prompt') return 1.75
  if (kind === 'mailbox') return 1.55
  return 1.65
}

function cameraTargetLiftForHotspot(kind: WorldHotspot['kind']): number {
  if (kind === 'value') return 1.35
  if (kind === 'prompt') return 0.75
  if (kind === 'mailbox') return 0.75
  return 0.45
}

interface CameraTransitionState {
  startPosition: THREE.Vector3
  endPosition: THREE.Vector3
  startTarget: THREE.Vector3
  endTarget: THREE.Vector3
  startTime: number
  duration: number
}

interface CameraRestorePoint {
  position: THREE.Vector3
  target: THREE.Vector3
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

function applyWeatherLighting(
  scene: THREE.Scene,
  ambient: THREE.HemisphereLight,
  key: THREE.DirectionalLight,
  elapsed: number,
  controls?: WorldEnvironmentControls,
) {
  const weather = worldWeatherAtElapsed(elapsed, controls)
  scene.fog?.color.setRGB(weather.skyMid[0] / 255, weather.skyMid[1] / 255, weather.skyMid[2] / 255)
  ambient.color.setRGB(weather.hemiTop[0] / 255, weather.hemiTop[1] / 255, weather.hemiTop[2] / 255)
  ambient.groundColor.setRGB(
    weather.hemiBottom[0] / 255,
    weather.hemiBottom[1] / 255,
    weather.hemiBottom[2] / 255,
  )
  ambient.intensity = weather.hemiIntensity
  key.color.setRGB(weather.sunColor[0] / 255, weather.sunColor[1] / 255, weather.sunColor[2] / 255)
  key.intensity = 0.95 * weather.sunIntensity
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
