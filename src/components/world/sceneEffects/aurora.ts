import * as THREE from 'three'
import type { WorldEnvironmentControls } from '../worldStyle'
import {
  WORLD_STYLE,
  worldNightFactorForControls,
  worldTwilightFactorForControls,
} from '../worldStyle'

interface AuroraMotion {
  materials: AuroraMaterial[]
  motionScale: number
  opacity: number
}

type AuroraMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number }
    uOpacity: { value: number }
    uColor1: { value: THREE.Color }
    uColor2: { value: THREE.Color }
    uColor3: { value: THREE.Color }
  }
}

export function createAuroraEffect(motionScale: number): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-twilight-aurora'
  const materials: AuroraMaterial[] = []
  const ringRadius = 22
  const width = 9
  const height = 16
  const colors = [
    [0x6cb148, 0x7fb3d9, 0xb49ad6],
    [0x84d65e, 0x66c8d8, 0xd09ee8],
    [0x6cb148, 0xff8a5c, 0xb49ad6],
  ] as const

  for (let i = 0; i < WORLD_STYLE.effects.auroraRibbons; i += 1) {
    const colorSet = colors[i % colors.length] ?? colors[0]
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: i * 4.1 },
        uOpacity: { value: 0 },
        uColor1: { value: new THREE.Color(colorSet[0]) },
        uColor2: { value: new THREE.Color(colorSet[1]) },
        uColor3: { value: new THREE.Color(colorSet[2]) },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          float w1 = sin(p.x * 0.6 + uTime * 0.4) * 0.5;
          float w2 = sin(p.x * 1.5 + uTime * 0.25 + 1.2) * 0.3;
          float w3 = sin(p.x * 0.32 + uTime * 0.18 + 2.7) * 0.7;
          p.z += (w1 + w2 + w3) * (0.25 + uv.y * 0.75);
          p.y += sin(p.x * 0.2 + uTime * 0.1) * 0.3 * uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        varying vec2 vUv;
        void main() {
          float c1 = pow(sin(vUv.x * 13.0 + uTime * 0.5) * 0.5 + 0.5, 2.0);
          float c2 = pow(sin(vUv.x * 8.0 - uTime * 0.3 + 1.8) * 0.5 + 0.5, 3.0);
          float curtain = max(c1 * 0.8, c2 * 0.5);
          float shimmer = 0.8 + 0.2 * sin(vUv.x * 28.0 + vUv.y * 7.0 + uTime * 1.8);
          float vfade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          float hfade = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
          vec3 col = vUv.y < 0.4
            ? mix(uColor1, uColor2, vUv.y / 0.4)
            : mix(uColor2, uColor3, (vUv.y - 0.4) / 0.6);
          gl_FragColor = vec4(col, curtain * vfade * hfade * shimmer * uOpacity * 0.5);
        }
      `,
    }) as AuroraMaterial
    materials.push(material)

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 48, 18), material)
    const angle = (i / WORLD_STYLE.effects.auroraRibbons) * Math.PI * 2
    mesh.position.set(
      Math.cos(angle) * ringRadius,
      height * 0.35 + (i % 2) * 0.6,
      Math.sin(angle) * ringRadius,
    )
    mesh.lookAt(0, mesh.position.y, 0)
    mesh.frustumCulled = false
    mesh.renderOrder = 998
    group.add(mesh)
  }

  group.userData.auroraMotion = { materials, motionScale, opacity: 0 }
  return group
}

export function tickAuroraEffect(
  root: THREE.Object3D,
  elapsed: number,
  controls?: WorldEnvironmentControls,
) {
  const motion = root.userData.auroraMotion as AuroraMotion | undefined
  if (!motion) return
  const enabled = controls?.aurora ?? true
  const target = enabled
    ? Math.max(
        worldNightFactorForControls(elapsed, controls),
        worldTwilightFactorForControls(elapsed, controls) * 0.42,
      )
    : 0
  motion.opacity += (target - motion.opacity) * 0.08
  for (const material of motion.materials) {
    material.uniforms.uTime.value += 0.016 * motion.motionScale
    material.uniforms.uOpacity.value = motion.opacity
  }
}
