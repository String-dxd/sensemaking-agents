import * as THREE from 'three'
import type { TerrainDescriptor } from './vipsWorldMapping'
import { WORLD_STYLE } from './worldStyle'

const CURVE_K = 0.13
const CURVE_STRENGTH = 0.65
const SEA = new THREE.Color(WORLD_STYLE.island.sea)
const SEA_DEEP = new THREE.Color(WORLD_STYLE.island.seaDeep)
const FOAM = new THREE.Color(WORLD_STYLE.island.foam)

const islandShape = {
  radius: 5,
  sandOuterRadius: 7.2,
  plateauTopY: 1,
  sandTopY: 0.18,
  cliffHeight: 0.55,
  noiseAmp: 0.22,
  noiseFreq: 0.6,
  detailAmp: 0.035,
}

export const STUDENT_SPACE_ISLAND_CHUNK_SIZE = 16
export const STUDENT_SPACE_ISLAND_TEXTURE_SIZE = 256

export function createIsland(_terrain: TerrainDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-island'

  const curveUniforms = {
    uCurveK: { value: CURVE_K },
    uCurveStrength: { value: CURVE_STRENGTH },
  }

  group.add(createPlateau(curveUniforms))
  group.add(createSand(curveUniforms))
  group.add(createCliff(curveUniforms))
  group.add(createWater(curveUniforms))

  return group
}

export function positionOnIsland(seed: number, radius = 1): THREE.Vector3 {
  const angle = (seed % 360) * (Math.PI / 180)
  const band = 0.22 + ((seed * 17) % 62) / 100
  const r = radiusAtTheta(angle) * Math.min(0.92, band * radius)
  const x = Math.cos(angle) * r
  const z = Math.sin(angle) * r
  return new THREE.Vector3(x, islandHeightAt(x, z) + 0.04, z)
}

export function islandHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const theta = Math.atan2(z, x)
  const plateauR = radiusAtTheta(theta)
  if (r > plateauR) {
    if (r < radiusAtTheta(theta, islandShape.sandOuterRadius)) return islandShape.sandTopY
    return -1
  }

  const rim = Math.min(1, (plateauR - r) / 0.7)
  const detail = terrainDetail(x, z) * smoothstep(0, 0.35, rim)
  const peak = islandShape.plateauTopY + islandShape.noiseAmp * terrainPatch(x, z) + detail
  const baseAtRim = islandShape.sandTopY + islandShape.cliffHeight
  return baseAtRim + (peak - baseAtRim) * rim
}

export function isOnPlateau(x: number, z: number): boolean {
  return Math.hypot(x, z) < radiusAt(x, z)
}

export function radiusAtTheta(theta: number, baseRadius = islandShape.radius): number {
  return baseRadius * silhouetteAt(theta)
}

function radiusAt(x: number, z: number, baseRadius = islandShape.radius): number {
  return radiusAtTheta(Math.atan2(z, x), baseRadius)
}

function silhouetteAt(theta: number): number {
  return (
    1 +
    Math.sin(theta * 2 + 0.7) * 0.13 +
    Math.sin(theta * 3 - 1.3) * 0.07 +
    Math.sin(theta * 5 + 2.1) * 0.04
  )
}

function terrainPatch(x: number, z: number): number {
  return (
    (Math.cos(x * islandShape.noiseFreq) * Math.cos(z * islandShape.noiseFreq * 0.85) +
      Math.cos((x + z) * islandShape.noiseFreq * 0.6)) *
    0.5
  )
}

function terrainDetail(x: number, z: number): number {
  return (
    (Math.sin(x * 2.15 + z * 0.75) * 0.45 +
      Math.sin(z * 2.7 - x * 0.35) * 0.3 +
      Math.sin((x + z) * 4.1) * 0.25) *
    islandShape.detailAmp
  )
}

function normalAt(x: number, z: number): [number, number, number] {
  if (Math.hypot(x, z) > radiusAt(x, z) + 0.05) return [1, 0, 0]
  const h = 0.05
  const dx = (islandHeightAt(x + h, z) - islandHeightAt(x - h, z)) / (2 * h)
  const dz = (islandHeightAt(x, z + h) - islandHeightAt(x, z - h)) / (2 * h)
  const nx = -dx
  const ny = 1
  const nz = -dz
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

function buildDiscGeometry(radius: number, radialSegments: number, angularSegments: number) {
  const vertices = [0, islandHeightAt(0, 0), 0]
  const indices: number[] = []

  for (let ring = 1; ring <= radialSegments; ring += 1) {
    const t = ring / radialSegments
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const theta = (seg / angularSegments) * Math.PI * 2
      const r = radiusAtTheta(theta, radius) * t
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      vertices.push(x, islandHeightAt(x, z), z)
    }
  }

  for (let seg = 0; seg < angularSegments; seg += 1) {
    const a = 1 + seg
    const b = 1 + ((seg + 1) % angularSegments)
    indices.push(0, b, a)
  }

  for (let ring = 2; ring <= radialSegments; ring += 1) {
    const prev = 1 + (ring - 2) * angularSegments
    const curr = 1 + (ring - 1) * angularSegments
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const next = (seg + 1) % angularSegments
      indices.push(prev + seg, curr + next, curr + seg, prev + seg, prev + next, curr + next)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function buildSandRingGeometry(radialSegments: number, angularSegments: number) {
  const vertices: number[] = []
  const indices: number[] = []
  const slope = -0.85

  for (let ring = 0; ring <= radialSegments; ring += 1) {
    const t = ring / radialSegments
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const theta = (seg / angularSegments) * Math.PI * 2
      const inner = radiusAtTheta(theta)
      const outer = radiusAtTheta(theta, islandShape.sandOuterRadius)
      const r = inner + (outer - inner) * t
      const ripple = sandRippleAt(theta, t)
      vertices.push(
        Math.cos(theta) * r,
        islandShape.sandTopY + slope * t + ripple,
        Math.sin(theta) * r,
      )
    }
  }

  for (let ring = 0; ring < radialSegments; ring += 1) {
    const curr = ring * angularSegments
    const nextRing = (ring + 1) * angularSegments
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const next = (seg + 1) % angularSegments
      indices.push(
        curr + seg,
        nextRing + next,
        nextRing + seg,
        curr + seg,
        curr + next,
        nextRing + next,
      )
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function buildCliffGeometry(angularSegments: number) {
  const vertices: number[] = []
  const indices: number[] = []
  const yBottom = islandShape.sandTopY
  const yTop = islandShape.sandTopY + islandShape.cliffHeight

  for (let seg = 0; seg < angularSegments; seg += 1) {
    const theta = (seg / angularSegments) * Math.PI * 2
    const topR = radiusAtTheta(theta) * 0.99
    const bottomR = radiusAtTheta(theta) * 1.04
    vertices.push(
      Math.cos(theta) * bottomR,
      yBottom,
      Math.sin(theta) * bottomR,
      Math.cos(theta) * topR,
      yTop,
      Math.sin(theta) * topR,
    )
  }

  for (let seg = 0; seg < angularSegments; seg += 1) {
    const next = (seg + 1) % angularSegments
    const b0 = seg * 2
    const t0 = b0 + 1
    const b1 = next * 2
    const t1 = b1 + 1
    indices.push(b0, t1, b1, b0, t0, t1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createPlateau(curveUniforms: CurveUniforms): THREE.Mesh {
  const geometry = buildDiscGeometry(islandShape.radius, 56, 192)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(WORLD_STYLE.island.plateau) },
      uSunPosition: { value: new THREE.Vector3(-0.5, -0.5, -0.5) },
      ...curveUniforms,
    },
    vertexShader: `
      uniform float uCurveK;
      uniform float uCurveStrength;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 p = position;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        float r = length(wp.xz);
        p.y -= (r * r) * (uCurveK * uCurveK) * uCurveStrength;
        vNormal = normalize(normalMatrix * normal);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uSunPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      float islandHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float islandNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = islandHash(i);
        float b = islandHash(i + vec2(1.0, 0.0));
        float c = islandHash(i + vec2(0.0, 1.0));
        float d = islandHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main() {
        float sunShade = dot(vNormal, -uSunPosition) * 0.5 + 0.5;
        vec3 shadeColor = uColor * vec3(0.0, 0.5, 0.7);
        float broad = islandNoise(vWorldPosition.xz * 2.0);
        float grain = islandNoise(vWorldPosition.xz * 8.0);
        float rim = smoothstep(3.8, 5.25, length(vWorldPosition.xz));
        vec3 base = mix(uColor * 0.88, uColor * 1.08, broad);
        base += vec3((grain - 0.5) * 0.045);
        base = mix(base, base * vec3(0.78, 0.9, 0.72), rim * 0.28);
        vec3 col = mix(base, shadeColor, sunShade);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'student-space-plateau'
  mesh.userData.worldAnimatedMaterial = material
  return mesh
}

function createSand(curveUniforms: CurveUniforms): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({ color: WORLD_STYLE.island.sand })
  applyCurvedEarth(material, curveUniforms, 'sand')
  const mesh = new THREE.Mesh(buildSandRingGeometry(18, 192), material)
  mesh.name = 'student-space-sand'
  return mesh
}

function createCliff(curveUniforms: CurveUniforms): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({ color: WORLD_STYLE.island.cliff })
  applyCurvedEarth(material, curveUniforms, 'cliff')
  const mesh = new THREE.Mesh(buildCliffGeometry(192), material)
  mesh.name = 'student-space-cliff'
  return mesh
}

function createWater(curveUniforms: CurveUniforms): THREE.Mesh {
  const waterRadius = WORLD_STYLE.island.waterRadius
  const geometry = new THREE.PlaneGeometry(
    waterRadius * 2,
    waterRadius * 2,
    WORLD_STYLE.island.waterSegments,
    WORLD_STYLE.island.waterSegments,
  )
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSea: { value: SEA.clone() },
      uDeep: { value: SEA_DEEP.clone() },
      uFoam: { value: FOAM.clone() },
      uSkyTint: { value: new THREE.Color(0xffffff) },
      uIslandR: { value: islandShape.sandOuterRadius },
      uWaveAmp: { value: WORLD_STYLE.island.waveAmplitude },
      uRain: { value: 0 },
      ...curveUniforms,
    },
    vertexShader: `
      varying vec2 vXZ;
      varying float vWave;
      uniform float uTime;
      uniform float uWaveAmp;
      uniform float uRain;
      uniform float uCurveK;
      uniform float uCurveStrength;
      void main() {
        vec3 p = position;
        vXZ = p.xz;
        float r = length(p.xz);
        float damp = smoothstep(${islandShape.sandOuterRadius.toFixed(2)} - 0.5, ${islandShape.sandOuterRadius.toFixed(2)} + 6.0, r);
        float w1 = sin(p.x * 0.45 + uTime * 0.9) * 0.6;
        float w2 = sin(p.z * 0.38 - uTime * 0.7) * 0.5;
        float w3 = sin((p.x + p.z) * 0.85 + uTime * 1.6) * 0.18;
        float ampScale = ${WORLD_STYLE.island.oceanRainAmplitudeBase.toFixed(2)} + uRain * ${WORLD_STYLE.island.oceanRainAmplitudeScale.toFixed(2)};
        float wave = (w1 + w2 + w3) * uWaveAmp * ampScale * damp;
        p.y += wave;
        p.y -= (r * r) * (uCurveK * uCurveK) * uCurveStrength;
        vWave = wave;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vXZ;
      varying float vWave;
      uniform vec3 uSea;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform vec3 uSkyTint;
      uniform float uIslandR;
      uniform float uTime;
      void main() {
        float r = length(vXZ);
        float depthT = smoothstep(uIslandR, uIslandR + 14.0, r);
        vec3 col = mix(uSea, uDeep, depthT);
        col = mix(col, col * uSkyTint, 0.35);
        float y = vWave * 4.0;
        float ox = vXZ.x;
        float oy = vXZ.y;
        float t = uTime;
        float w1 = sin(ox * 2.15 + oy * 1.35 + y * 0.55 + t * 3.6) * 0.5 + 0.5;
        float w2 = sin(oy * 1.85 + y * 2.65 + ox * 0.35 - t * 2.7) * 0.5 + 0.5;
        float w3 = sin(y * 1.55 + ox * 0.95 + oy * 2.35 + t * 2.1) * 0.5 + 0.5;
        float w4 = sin(ox * 0.85 + y * 1.45 - oy * 0.65 + t * 1.5) * 0.5 + 0.5;
        float w5 = sin(oy * 0.55 + ox * 2.95 + y * 1.15 - t * 1.2) * 0.5 + 0.5;
        float w6 = sin(y * 2.05 - oy * 0.35 + ox * 1.65 + t * 1.8) * 0.5 + 0.5;
        float w7 = sin(ox * 3.35 - y * 2.15 + oy * 0.15 - t * 0.9) * 0.5 + 0.5;
        float blobs = w1 * w2 * w4 * w6 + w3 * w5 * w7 * 0.3;
        blobs = 1.0 - smoothstep(0.002, 0.015, blobs);
        float shallowness = 1.0 - depthT;
        blobs *= smoothstep(uIslandR + 0.6, uIslandR + 2.5, r);
        col += vec3(0.7, 1.0, 1.0) * blobs * mix(0.03, 0.17, shallowness);

        float sp1 = sin(ox * 2.00 + oy * 1.15 + y * 0.45 + t * 3.5);
        float sp2 = sin(oy * 1.75 + y * 1.45 + ox * 0.65 - t * 2.8);
        float sp3 = sin(y * 1.35 + ox * 1.85 - oy * 0.85 + t * 4.1);
        float sp4 = sin(ox * 3.55 - y * 2.35 + oy * 0.25 + t * 1.9);
        float sp5 = sin(oy * 2.95 + ox * 0.55 - y * 1.55 - t * 2.3);
        float spMask = sin(ox * 0.155 + y * 0.235 + t * 0.25)
          * sin(oy * 0.265 - ox * 0.145 - t * 0.18);
        spMask *= sin(y * 0.115 + oy * 0.195 + t * 0.35);
        spMask = smoothstep(0.15, 0.5, spMask);
        float sparkle = sp1 * sp2 * sp3 * sp4 + sp2 * sp3 * sp5 * 0.5;
        float sparkleThresh = mix(0.70, 0.30, shallowness);
        sparkle = smoothstep(sparkleThresh, 0.97, sparkle) * spMask;
        sparkle *= smoothstep(uIslandR + 0.6, uIslandR + 4.0, r);
        col += vec3(1.0) * sparkle * mix(0.18, 0.30, shallowness);

        float edgeFoam = smoothstep(uIslandR + 0.65, uIslandR + 0.10, r)
          * smoothstep(uIslandR - 0.40, uIslandR + 0.20, r);
        float pulseA = fract(uTime * 0.18);
        float pulseB = fract(uTime * 0.18 + 0.5);
        float ringA = smoothstep(0.35, 0.0, abs(r - (uIslandR + 0.4 + pulseA * 2.6))) * (1.0 - pulseA);
        float ringB = smoothstep(0.35, 0.0, abs(r - (uIslandR + 0.4 + pulseB * 2.6))) * (1.0 - pulseB);
        float foam = max(edgeFoam, max(ringA, ringB) * 0.55);
        col = mix(col, uFoam, foam * 0.78);
        col += vec3(0.15) * max(0.0, vWave) * 4.5;
        col -= vec3(0.08) * max(0.0, -vWave) * 3.0;
        float farFade = smoothstep(uIslandR + 12.0, uIslandR + 22.0, r);
        col = mix(col, uSkyTint, farFade * 0.45);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'student-space-water'
  mesh.position.y = WORLD_STYLE.island.waterY
  mesh.frustumCulled = false
  mesh.userData.worldAnimatedMaterial = material
  mesh.userData.worldAnimatedKind = 'ocean'
  return mesh
}

type CurveUniforms = {
  uCurveK: { value: number }
  uCurveStrength: { value: number }
}

function applyCurvedEarth(
  material: THREE.MeshLambertMaterial,
  curveUniforms: CurveUniforms,
  detailKind: 'sand' | 'cliff',
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCurveK = curveUniforms.uCurveK
    shader.uniforms.uCurveStrength = curveUniforms.uCurveStrength
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uCurveK;\nuniform float uCurveStrength;\nvarying vec3 vIslandWorld;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 _wp = modelMatrix * vec4(transformed, 1.0);
        vIslandWorld = _wp.xyz;
        float _r = length(_wp.xz);
        transformed.y -= (_r * _r) * (uCurveK * uCurveK) * uCurveStrength;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vIslandWorld;
        float islandHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float islandNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = islandHash(i);
          float b = islandHash(i + vec2(1.0, 0.0));
          float c = islandHash(i + vec2(0.0, 1.0));
          float d = islandHash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        detailKind === 'sand'
          ? `vec3 detailDiffuse = diffuse;
          float sandR = length(vIslandWorld.xz);
          float grain = islandNoise(vIslandWorld.xz * 14.0);
          float broad = islandNoise(vIslandWorld.xz * 2.2);
          float shell = smoothstep(5.0, 7.25, sandR);
          float wet = 1.0 - smoothstep(-0.28, 0.10, vIslandWorld.y);
          float rings = sin(sandR * 11.0 + islandNoise(vIslandWorld.xz * 3.0) * 3.0) * 0.5 + 0.5;
          detailDiffuse = mix(detailDiffuse * 0.92, detailDiffuse * 1.08, broad);
          detailDiffuse = mix(detailDiffuse, vec3(0.86, 0.74, 0.42), rings * 0.2 * (1.0 - wet));
          detailDiffuse = mix(detailDiffuse, vec3(0.62, 0.54, 0.36), wet * 0.42);
          detailDiffuse += vec3((grain - 0.5) * 0.13);
          detailDiffuse *= 1.0 - shell * 0.08;
          vec4 diffuseColor = vec4( detailDiffuse, opacity );`
          : `vec3 detailDiffuse = diffuse;
          float layer = sin(vIslandWorld.y * 34.0 + islandNoise(vIslandWorld.xz * 2.6) * 4.0) * 0.5 + 0.5;
          float chips = islandNoise(vIslandWorld.xz * 10.0 + vIslandWorld.y);
          detailDiffuse = mix(detailDiffuse * 0.78, detailDiffuse * 1.12, layer * 0.32 + chips * 0.18);
          vec4 diffuseColor = vec4( detailDiffuse, opacity );`,
      )
  }
}

function sandRippleAt(theta: number, t: number): number {
  const innerFade = smoothstep(0.06, 0.24, t)
  const outerFade = 1 - smoothstep(0.78, 1, t)
  const bands = Math.sin(t * 68 + theta * 4.5) * 0.04
  const cross = Math.sin(theta * 13 + t * 17) * 0.022
  const scallop = Math.sin(theta * 19) * 0.018 * (1 - t)
  return (bands + cross + scallop) * innerFade * outerFade
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function islandNormalAt(x: number, z: number): [number, number, number] {
  return normalAt(x, z)
}
