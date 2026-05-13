import * as THREE from 'three'
import type { TerrainDescriptor } from './vipsWorldMapping'

type CloudMotion = {
  baseX: number
  baseY: number
  speed: number
  phase: number
  wrapMin: number
  wrapWidth: number
}

export function createSkyBackdrop(terrain: TerrainDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = 'animal-crossing-sky'
  group.renderOrder = -100

  group.add(createSkyDome(terrain))
  group.add(createCloudField())
  return group
}

export function tickSkyBackdrop(sky: THREE.Object3D, elapsed: number) {
  sky.traverse((object) => {
    const motion = object.userData.cloudMotion as CloudMotion | undefined
    if (!motion) return
    const localX = motion.baseX + elapsed * motion.speed - motion.wrapMin
    object.position.x = motion.wrapMin + THREE.MathUtils.euclideanModulo(localX, motion.wrapWidth)
    object.position.y = motion.baseY + Math.sin(elapsed * 0.11 + motion.phase) * 0.08
  })
}

function createSkyDome(terrain: TerrainDescriptor): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(80, 48, 24)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(terrain.mood === 'sheltered' ? 0x0439a8 : 0x001f9e) },
      uMid: { value: new THREE.Color(terrain.mood === 'sheltered' ? 0x075ad8 : 0x003fd2) },
      uHorizon: { value: new THREE.Color(terrain.mood === 'sheltered' ? 0x38b8ff : 0x1298f0) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      varying vec3 vWorldPos;
      void main() {
        float t = smoothstep(-8.0, 28.0, vWorldPos.y);
        vec3 lower = mix(uHorizon, uMid, smoothstep(0.0, 0.58, t));
        vec3 color = mix(lower, uTop, smoothstep(0.42, 1.0, t));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'sky-gradient-dome'
  mesh.renderOrder = -100
  return mesh
}

function createCloudField(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'soft-3ds-clouds'
  group.renderOrder = 20
  const texture = createCloudTexture()

  const placements = [
    { x: -9.6, y: 1.7, z: -16, sx: 5.2, sy: 1.28, opacity: 0.42 },
    { x: -2.4, y: 4.1, z: -18, sx: 5.7, sy: 1.38, opacity: 0.36 },
    { x: 6.2, y: 2.6, z: -17, sx: 6.1, sy: 1.46, opacity: 0.4 },
    { x: 12.2, y: 4.9, z: -20, sx: 6.4, sy: 1.52, opacity: 0.32 },
    { x: -15.2, y: 5.2, z: -21, sx: 4.8, sy: 1.16, opacity: 0.28 },
    { x: 15.2, y: 1.4, z: -17, sx: 5.2, sy: 1.2, opacity: 0.3 },
  ]

  placements.forEach((placement, index) => {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: placement.opacity,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
    const cloud = new THREE.Sprite(material)
    cloud.name = 'soft-horizon-cloud'
    cloud.position.set(placement.x, placement.y, placement.z)
    cloud.scale.set(placement.sx, placement.sy, 1)
    cloud.renderOrder = 20
    cloud.userData.cloudMotion = {
      baseX: placement.x,
      baseY: placement.y,
      speed: 0.12 + index * 0.018,
      phase: index * 1.7,
      wrapMin: -18,
      wrapWidth: 36,
    } satisfies CloudMotion
    group.add(cloud)
  })

  return group
}

function createCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.filter = 'blur(7px)'
  drawPuff(ctx, 116, 96, 108, 48, 0.56)
  drawPuff(ctx, 210, 76, 120, 58, 0.72)
  drawPuff(ctx, 308, 94, 132, 52, 0.5)
  drawPuff(ctx, 392, 86, 76, 36, 0.38)
  ctx.filter = 'none'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

function drawPuff(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  opacity: number,
) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry))
  gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`)
  gradient.addColorStop(0.55, `rgba(255, 255, 255, ${opacity * 0.54})`)
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}
