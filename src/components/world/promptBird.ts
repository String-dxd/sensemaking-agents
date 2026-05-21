import * as THREE from 'three'
import { addWorldHitTarget, attachWorldHotspot, hotspotForPromptBird } from './hotspots'
import { islandHeightAt } from './island'

const BODY_GREEN = 0x9cc8c0
const BODY_CAMO = [0x8fb9a9, 0xf0a86a, 0xffb0a0] as const
const WARM_YELLOW = 0xfaf1dc
const FACE_WHITE = 0xfffbf2
const HEAD_RED = 0xff8a5c
const TOP_GREEN = 0x9cc8c0
const BEAK_BLUE = 0x2b2620
const INK = 0x2b2620
const LEG_ORANGE = 0xa07659
const PROMPT_BIRD_BASE_SCALE = 0.78
const PROMPT_BIRD_GROUND_LIFT = 0.18

export const PROMPT_BIRD_PROMPTS = [
  "What's on your mind right now?",
  'What do you do in your free time?',
  'What felt meaningful recently?',
  'What are you quietly curious about?',
  'What kind of help feels good to give?',
  'What has been taking up space in your head?',
] as const

export function pickPromptBirdPrompt(): string {
  const index = Math.floor(Math.random() * PROMPT_BIRD_PROMPTS.length)
  return PROMPT_BIRD_PROMPTS[index] ?? PROMPT_BIRD_PROMPTS[0]
}

export function createPromptBird(prompt: string): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-prompt-bird'
  attachWorldHotspot(group, hotspotForPromptBird(prompt))

  const theta = 0.88
  const radius = 1.7
  const x = Math.cos(theta) * radius
  const z = Math.sin(theta) * radius
  const anchor = new THREE.Vector3(x, islandHeightAt(x, z) + PROMPT_BIRD_GROUND_LIFT, z)
  group.position.copy(anchor)
  group.rotation.y = Math.PI - 0.18
  group.scale.setScalar(PROMPT_BIRD_BASE_SCALE)

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 32, 24),
    softMaterial(WARM_YELLOW, 0.08),
  )
  body.position.y = 0.58
  body.scale.set(0.92, 1.08, 0.76)
  group.add(body)

  const jacket = new THREE.Mesh(
    new THREE.SphereGeometry(0.39, 32, 18, 0, Math.PI * 2, 0.36, Math.PI * 0.84),
    softMaterial(BODY_GREEN, 0.05),
  )
  jacket.position.set(0, 0.62, -0.01)
  jacket.scale.set(0.96, 0.9, 0.75)
  group.add(jacket)
  addWingAccents(group)

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), softMaterial(0xffd8b7, 0.04))
  belly.position.set(0, 0.34, -0.01)
  belly.scale.set(0.85, 0.58, 0.58)
  group.add(belly)

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 40, 32),
    softMaterial(FACE_WHITE, 0.05),
  )
  head.position.y = 1.12
  head.scale.set(1.06, 1, 0.98)
  group.add(head)

  const redCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.486, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.48),
    softMaterial(HEAD_RED, 0.04),
  )
  redCap.position.copy(head.position)
  redCap.scale.copy(head.scale)
  group.add(redCap)

  addCrest(group)

  addCheek(group, -1)
  addCheek(group, 1)
  addEye(group, -1)
  addEye(group, 1)
  addBrow(group, -1)
  addBrow(group, 1)
  addBeak(group)
  const leftArm = addArm(group, -1)
  const rightArm = addArm(group, 1)
  const leftLeg = addLeg(group, -1)
  const rightLeg = addLeg(group, 1)
  addPromptBubble(group, prompt)

  addWorldHitTarget(group, {
    name: 'student-space-prompt-bird-hit-target',
    position: new THREE.Vector3(0, 0.95, 0),
    scale: new THREE.Vector3(0.95, 1.2, 0.95),
    priority: 80,
  })

  group.userData.promptBirdMotion = {
    anchor,
    baseScale: PROMPT_BIRD_BASE_SCALE,
    phase: 0.42,
    speed: 0.34,
    walkRadiusX: 0.34,
    walkRadiusZ: 0.22,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
  } satisfies PromptBirdMotion

  return group
}

export function tickPromptBird(root: THREE.Object3D, time: number, motionScale = 1) {
  root.traverse((object) => {
    const motion = object.userData.promptBirdMotion as PromptBirdMotion | undefined
    if (!motion) return

    const a = time * motion.speed + motion.phase
    const x = motion.anchor.x + Math.cos(a) * motion.walkRadiusX
    const z = motion.anchor.z + Math.sin(a) * motion.walkRadiusZ
    const velocityX = -Math.sin(a) * motion.walkRadiusX
    const velocityZ = Math.cos(a) * motion.walkRadiusZ
    const stride = Math.sin(time * 5.4 + motion.phase) * 0.2 * motionScale

    object.position.set(
      x,
      islandHeightAt(x, z) + PROMPT_BIRD_GROUND_LIFT + Math.abs(stride) * 0.015,
      z,
    )
    object.rotation.y = Math.atan2(-velocityX, -velocityZ)
    object.scale.setScalar(motion.baseScale * (1 + Math.abs(stride) * 0.018))
    motion.leftLeg.rotation.x = stride
    motion.rightLeg.rotation.x = -stride
    motion.leftArm.rotation.x = -stride * 0.2
    motion.rightArm.rotation.x = stride * 0.2
  })
}

function addCheek(group: THREE.Group, side: -1 | 1) {
  const cheek = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 24, 16),
    softMaterial(WARM_YELLOW, 0.06),
  )
  cheek.position.set(side * 0.39, 1.04, -0.2)
  cheek.scale.set(0.36, 1.15, 0.16)
  cheek.rotation.z = side * -0.25
  group.add(cheek)
}

function addEye(group: THREE.Group, side: -1 | 1) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), flatMaterial(INK))
  eye.position.set(side * 0.18, 1.17, -0.43)
  group.add(eye)
}

function addBrow(group: THREE.Group, side: -1 | 1) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.12, 1.32, -0.43),
    new THREE.Vector3(side * 0.2, 1.37, -0.42),
    new THREE.Vector3(side * 0.32, 1.37, -0.37),
  ])
  const brow = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 8), flatMaterial(INK))
  group.add(brow)
}

function addBeak(group: THREE.Group) {
  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 4), softMaterial(BEAK_BLUE, 0.05))
  upper.position.set(0, 1.07, -0.53)
  upper.rotation.set(Math.PI * 0.5, Math.PI / 4, 0)
  upper.scale.set(1.12, 0.78, 0.74)
  group.add(upper)

  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 4), softMaterial(0x1f1a16, 0.04))
  lower.position.set(0, 0.99, -0.5)
  lower.rotation.set(Math.PI * 0.5, Math.PI / 4, Math.PI)
  lower.scale.set(1, 0.62, 0.58)
  group.add(lower)
}

function addArm(group: THREE.Group, side: -1 | 1): THREE.Group {
  const arm = new THREE.Group()
  arm.name = `prompt-bird-${side < 0 ? 'left' : 'right'}-arm`
  arm.position.set(side * 0.25, 0.74, -0.02)

  const sleeve = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.055, 0.34, 8, 14),
    softMaterial(BODY_GREEN, 0.05),
  )
  sleeve.position.set(side * 0.09, -0.14, 0)
  sleeve.rotation.z = side * 0.62
  arm.add(sleeve)

  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.063, 0.065, 16),
    flatMaterial(0x2d3530),
  )
  cuff.position.set(side * 0.22, -0.33, 0)
  cuff.rotation.z = side * 0.62
  arm.add(cuff)

  const wingTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.18, 16),
    softMaterial(TOP_GREEN, 0.03),
  )
  wingTip.position.set(side * 0.29, -0.39, 0)
  wingTip.rotation.z = side * -0.42
  arm.add(wingTip)
  group.add(arm)
  return arm
}

function addLeg(group: THREE.Group, side: -1 | 1): THREE.Group {
  const legGroup = new THREE.Group()
  legGroup.name = `prompt-bird-${side < 0 ? 'left' : 'right'}-leg`
  legGroup.position.set(side * 0.12, 0, 0)

  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.34, 12),
    flatMaterial(LEG_ORANGE),
  )
  leg.position.set(0, 0.02, 0)
  legGroup.add(leg)

  const foot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 16), flatMaterial(0xffb02e))
  foot.position.set(0, -0.16, -0.07)
  foot.rotation.x = Math.PI * 0.5
  foot.scale.set(1.3, 0.72, 0.45)
  legGroup.add(foot)
  group.add(legGroup)
  return legGroup
}

function addWingAccents(group: THREE.Group) {
  const placements = [
    [-0.16, 0.78, -0.29, 0],
    [0.12, 0.72, -0.31, 1],
    [-0.03, 0.54, -0.34, 2],
    [0.23, 0.53, -0.24, 0],
  ] as const
  for (const [x, y, z, colorIndex] of placements) {
    const patch = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 10),
      softMaterial(BODY_CAMO[colorIndex] ?? BODY_CAMO[0], 0.03),
    )
    patch.position.set(x, y, z)
    patch.scale.set(1.5, 0.7, 0.18)
    patch.rotation.z = x * 2.3
    group.add(patch)
  }
}

function addCrest(group: THREE.Group) {
  for (let i = -1; i <= 1; i += 1) {
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), flatMaterial(HEAD_RED))
    feather.position.set(i * 0.075, 1.52, -0.1)
    feather.rotation.set(Math.PI * 0.5, Math.PI / 3, i * -0.2)
    feather.scale.set(0.82, 0.92, 0.82)
    group.add(feather)
  }
}

function addPromptBubble(group: THREE.Group, prompt: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 260
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(255, 255, 248, 0.92)'
  context.strokeStyle = 'rgba(36, 40, 44, 0.16)'
  context.lineWidth = 4
  roundedRect(context, 20, 20, 600, 176, 44)
  context.fill()
  context.stroke()

  context.beginPath()
  context.moveTo(304, 194)
  context.lineTo(338, 194)
  context.lineTo(318, 228)
  context.closePath()
  context.fill()
  context.stroke()

  context.fillStyle = '#171717'
  context.font = '650 42px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (const [index, line] of wrapPromptText(context, prompt).entries()) {
    context.fillText(line, 320, 90 + index * 52)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  const bubble = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  )
  bubble.name = 'student-space-prompt-bird-bubble'
  bubble.position.set(0, 1.78, -0.08)
  bubble.scale.set(2.38, 0.96, 1)
  bubble.renderOrder = 4
  group.add(bubble)
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function wrapPromptText(context: CanvasRenderingContext2D, prompt: string): string[] {
  const words = prompt.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (context.measureText(next).width > 500 && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 2)
}

function softMaterial(color: number, emissiveIntensity: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(emissiveIntensity),
    flatShading: false,
  })
}

function flatMaterial(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: false })
}

interface PromptBirdMotion {
  anchor: THREE.Vector3
  baseScale: number
  phase: number
  speed: number
  walkRadiusX: number
  walkRadiusZ: number
  leftArm: THREE.Object3D
  rightArm: THREE.Object3D
  leftLeg: THREE.Object3D
  rightLeg: THREE.Object3D
}
