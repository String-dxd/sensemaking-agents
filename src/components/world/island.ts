import * as THREE from 'three'
import type { TerrainDescriptor } from './vipsWorldMapping'

const CURVE_K = 0.13
const CURVE_STRENGTH = 0.65
const SEA = new THREE.Color(0x1d75d6)
const SEA_DEEP = new THREE.Color(0x083fa4)
const SEA_SHALLOW = new THREE.Color(0x67dcef)
const FOAM = new THREE.Color(0xeafcff)
const SHORELINE_DRY = new THREE.Color(0xfff4c8)
const SHORELINE_PALE = new THREE.Color(0xffffec)

const islandShape = {
  radius: 5,
  sandOuterRadius: 7.8,
  plateauTopY: 0.7,
  sandTopY: 0.16,
  shoreBlendWidth: 1.55,
  noiseAmp: 0.13,
  noiseFreq: 0.6,
  detailAmp: 0.024,
}

export function createIsland(terrain: TerrainDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-island'

  const curveUniforms = {
    uCurveK: { value: CURVE_K },
    uCurveStrength: { value: CURVE_STRENGTH },
  }

  group.add(createPlateau(curveUniforms))
  group.add(createDirtBerm(curveUniforms))
  group.add(createSand(curveUniforms))
  group.add(createShoreLine(curveUniforms))
  group.add(createWater(curveUniforms, terrain))

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
    const outer = radiusAtTheta(theta, islandShape.sandOuterRadius)
    if (r < outer) {
      const t = (r - plateauR) / Math.max(0.001, outer - plateauR)
      const beachLip = islandShape.sandTopY + 0.06 + Math.sin(theta * 6) * 0.012
      return mix(beachLip, -0.24, smoothstep(0, 1, t)) + sandRippleAt(theta, t) * 0.35
    }
    return -0.45
  }

  const shoreT = smoothstep(0, islandShape.shoreBlendWidth, plateauR - r)
  const detail = terrainDetail(x, z) * smoothstep(0.18, 0.7, shoreT)
  const peak = islandShape.plateauTopY + islandShape.noiseAmp * terrainPatch(x, z) + detail
  const beachLip = islandShape.sandTopY + 0.06 + Math.sin(theta * 6) * 0.012
  return mix(beachLip, peak, shoreT)
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

  for (let ring = 0; ring <= radialSegments; ring += 1) {
    const t = ring / radialSegments
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const theta = (seg / angularSegments) * Math.PI * 2
      const inner = radiusAtTheta(theta)
      const outer = radiusAtTheta(theta, islandShape.sandOuterRadius)
      const r = inner + (outer - inner) * t
      const ripple = sandRippleAt(theta, t)
      const innerY = islandHeightAt(
        Math.cos(theta) * inner * 0.995,
        Math.sin(theta) * inner * 0.995,
      )
      const beachBerm = Math.sin(t * Math.PI) * 0.045
      vertices.push(
        Math.cos(theta) * r,
        mix(innerY - 0.012, -0.28, smoothstep(0, 1, t)) + ripple * 0.72 + beachBerm,
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

function buildShoreLineGeometry(radialSegments: number, angularSegments: number) {
  const vertices: number[] = []
  const bands: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= radialSegments; ring += 1) {
    const t = ring / radialSegments
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const theta = (seg / angularSegments) * Math.PI * 2
      const outer = radiusAtTheta(theta, islandShape.sandOuterRadius)
      const wobble =
        Math.sin(theta * 4.0 + t * 2.6 + 0.8) * 0.08 +
        Math.sin(theta * 8.5 - t * 3.4 - 1.2) * 0.045 +
        Math.sin(theta * 15.0 + 0.35) * 0.018
      const r = outer - 0.84 + t * 1.02 + wobble
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      const y =
        r < outer
          ? islandHeightAt(x, z) + 0.026 + Math.sin(t * Math.PI) * 0.012
          : -0.218 + Math.sin(theta * 9.0) * 0.004
      vertices.push(x, y, z)
      bands.push(t)
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
  geometry.setAttribute('aShoreBand', new THREE.Float32BufferAttribute(bands, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function buildTransitionRingGeometry(radialSegments: number, angularSegments: number) {
  const vertices: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= radialSegments; ring += 1) {
    const t = ring / radialSegments
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const theta = (seg / angularSegments) * Math.PI * 2
      const inner = radiusAtTheta(theta) * 0.82
      const outer = radiusAtTheta(theta) * 1.012
      const r = inner + (outer - inner) * t
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      const edgeLift = Math.sin(t * Math.PI) * 0.018
      vertices.push(x, islandHeightAt(x, z) + 0.012 + edgeLift, z)
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

function createPlateau(curveUniforms: CurveUniforms): THREE.Mesh {
  const geometry = buildDiscGeometry(islandShape.radius, 56, 192)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x58b14a) },
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
        float light = dot(normalize(vNormal), normalize(vec3(0.35, 0.88, 0.32))) * 0.5 + 0.5;
        float broad = islandNoise(vWorldPosition.xz * 2.0);
        float grain = islandNoise(vWorldPosition.xz * 8.0);
        float rim = smoothstep(3.35, 5.25, length(vWorldPosition.xz));
        vec3 base = mix(uColor * 0.88, uColor * 1.08, broad);
        base += vec3((grain - 0.5) * 0.045);
        base = mix(base, base * vec3(0.92, 1.03, 0.84), rim * 0.28);
        base *= 0.78 + light * 0.42;
        gl_FragColor = vec4(base, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'student-space-plateau'
  return mesh
}

function createSand(curveUniforms: CurveUniforms): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({ color: 0xffe9a3 })
  applyCurvedEarth(material, curveUniforms, 'sand')
  const mesh = new THREE.Mesh(buildSandRingGeometry(18, 192), material)
  mesh.name = 'student-space-sand'
  return mesh
}

function createShoreLine(curveUniforms: CurveUniforms): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDry: { value: SHORELINE_DRY.clone() },
      uPale: { value: SHORELINE_PALE.clone() },
      ...curveUniforms,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float aShoreBand;
      uniform float uCurveK;
      uniform float uCurveStrength;
      varying float vBand;
      varying vec2 vXZ;
      void main() {
        vec3 p = position;
        vBand = aShoreBand;
        vXZ = p.xz;
        float r = length(p.xz);
        p.y -= (r * r) * (uCurveK * uCurveK) * uCurveStrength;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDry;
      uniform vec3 uPale;
      varying float vBand;
      varying vec2 vXZ;

      float shoreHash(vec2 p) {
        return fract(sin(dot(p, vec2(41.7, 289.1))) * 43758.5453123);
      }
      float shoreNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = shoreHash(i);
        float b = shoreHash(i + vec2(1.0, 0.0));
        float c = shoreHash(i + vec2(0.0, 1.0));
        float d = shoreHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float softLine(float center, float width) {
        return 1.0 - smoothstep(width * 0.35, width, abs(vBand - center));
      }
      void main() {
        float theta = atan(vXZ.y, vXZ.x);
        float waveringCenter =
          0.70 +
          sin(theta * 4.2 + vBand * 2.8) * 0.07 +
          sin(theta * 9.5 - vBand * 3.4) * 0.036;
        float paleLine = softLine(waveringCenter, 0.23);
        float dryLine = softLine(0.38 + sin(theta * 3.4 + 0.7) * 0.055, 0.34);
        float edgeFade = smoothstep(0.02, 0.16, vBand) * (1.0 - smoothstep(0.94, 1.0, vBand));
        float broken = 0.68 + shoreNoise(vec2(theta * 5.0, vBand * 8.0)) * 0.32;
        float scallop = sin(theta * 22.0 + shoreNoise(vXZ * 0.7) * 2.6) * 0.5 + 0.5;
        float alpha = (dryLine * 0.2 + paleLine * 0.72) * edgeFade * broken;
        alpha *= 0.82 + scallop * 0.18;
        vec3 color = mix(uDry, uPale, paleLine * 0.82);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  })
  const mesh = new THREE.Mesh(buildShoreLineGeometry(8, 224), material)
  mesh.name = 'student-space-shore-line'
  mesh.renderOrder = 3
  return mesh
}

function createDirtBerm(curveUniforms: CurveUniforms): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({
    color: 0xbd8f4a,
    transparent: true,
    opacity: 0.9,
  })
  applyCurvedEarth(material, curveUniforms, 'dirt')
  const mesh = new THREE.Mesh(buildTransitionRingGeometry(8, 192), material)
  mesh.name = 'student-space-dirt-berm'
  return mesh
}

function createWater(curveUniforms: CurveUniforms, terrain: TerrainDescriptor): THREE.Mesh {
  const waterRadius = 60
  const geometry = new THREE.PlaneGeometry(waterRadius * 2, waterRadius * 2, 32, 32)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSea: { value: SEA.clone() },
      uDeep: { value: SEA_DEEP.clone() },
      uShallow: { value: SEA_SHALLOW.clone() },
      uFoam: { value: FOAM.clone() },
      uSkyTint: {
        value: new THREE.Color(terrain.mood === 'sheltered' ? 0x8fcdf2 : 0x65b8ff),
      },
      uIslandR: { value: islandShape.sandOuterRadius },
      uWaterMood: { value: terrain.water },
      ...curveUniforms,
    },
    transparent: true,
    vertexShader: `
      varying vec2 vXZ;
      uniform float uTime;
      uniform float uCurveK;
      uniform float uCurveStrength;
      void main() {
        vec3 p = position;
        vXZ = p.xz;
        float r = length(p.xz);
        p.y -= (r * r) * (uCurveK * uCurveK) * uCurveStrength;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vXZ;
      uniform vec3 uSea;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform vec3 uSkyTint;
      uniform float uIslandR;
      uniform float uTime;
      uniform float uWaterMood;
      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }
      float waterHash(vec2 p) {
        return fract(sin(dot(p, vec2(27.91, 113.47))) * 43758.5453);
      }
      float waterNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = waterHash(i);
        float b = waterHash(i + vec2(1.0, 0.0));
        float c = waterHash(i + vec2(0.0, 1.0));
        float d = waterHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float softCrest(float phase, float low, float high) {
        return smoothstep(low, high, sin(phase));
      }
      float softLine(float phase, float width) {
        return 1.0 - smoothstep(width * 0.36, width, abs(sin(phase)));
      }
      float causticRibbon(vec2 p, float width) {
        p += vec2(sin(p.y * 0.56) * 0.7, cos(p.x * 0.48) * 0.58);
        float a = softLine(p.x * 0.98 + sin(p.y * 0.72) * 1.62, width);
        float b = softLine(p.y * 0.9 + sin(p.x * 0.6) * 1.46, width * 1.12);
        float c = softLine((p.x + p.y) * 0.56 + sin((p.x - p.y) * 0.42) * 1.55, width * 1.35);
        return a * 0.44 + b * 0.34 + c * 0.26;
      }
      void main() {
        float r = length(vXZ);
        vec2 radial = normalize(vXZ + vec2(0.0001));
        vec2 tangent = vec2(-radial.y, radial.x);
        float theta = atan(vXZ.y, vXZ.x);
        float shoreDistance = max(0.0, r - uIslandR);
        float depthT = smoothstep(0.1, 23.0, shoreDistance);
        float shallowMask = 1.0 - smoothstep(1.0, 17.0, shoreDistance);

        vec3 col = mix(uShallow, uSea, smoothstep(0.0, 8.0, shoreDistance));
        col = mix(col, uDeep, smoothstep(10.0, 40.0, shoreDistance) * 0.78);
        col = mix(col, uSkyTint, 0.035);

        float inwardTime = uTime * (0.52 + uWaterMood * 0.1);
        float shoreWarp =
          sin(theta * 3.2 + shoreDistance * 0.22 - inwardTime * 0.22) * 0.72 +
          sin(theta * 7.4 - shoreDistance * 0.15 + inwardTime * 0.28) * 0.32 +
          waterNoise(vec2(theta * 1.6, shoreDistance * 0.13 + inwardTime * 0.12)) * 0.3;
        float waveCoord = shoreDistance + shoreWarp;
        float swellA = softCrest(waveCoord * 0.96 + inwardTime * 1.74, 0.18, 0.98);
        float swellB = softCrest(waveCoord * 0.52 + inwardTime * 1.08 + 1.7, 0.32, 0.98);
        float swellShadow = softCrest(waveCoord * 0.78 + inwardTime * 1.2 + 3.1, 0.48, 0.98);
        float broadSwell = saturate(swellA * 0.86 + swellB * 0.5);
        col *= mix(vec3(0.76, 0.88, 1.18), vec3(1.08, 1.16, 1.18), broadSwell * 0.7);
        col = mix(col, col * vec3(0.66, 0.8, 1.14), swellShadow * 0.18);
        col = mix(col, vec3(0.62, 0.9, 1.0), broadSwell * (0.13 + shallowMask * 0.17));

        vec2 flow =
          radial * inwardTime * 1.18 +
          tangent * (sin(uTime * 0.28 + theta * 2.0) * 0.24);
        float causticA = causticRibbon(vXZ * 0.5 + flow, 0.24);
        float causticB = causticRibbon(vXZ * 0.32 + flow * 0.72 + vec2(7.4, -2.0), 0.31);
        float causticC = causticRibbon(vXZ * 0.19 + flow * 0.48 + vec2(-4.0, 5.8), 0.38);
        float caustics = saturate(causticA * 0.5 + causticB * 0.36 + causticC * 0.26);
        caustics *= mix(0.48, 1.18, shallowMask);
        caustics *= 0.78 + broadSwell * 0.34;

        float washMask = 1.0 - smoothstep(0.24, 3.5, shoreDistance);
        float washPhase =
          shoreDistance * 1.92 +
          inwardTime * 2.85 +
          sin(theta * 4.2 + shoreDistance * 0.34 + uTime * 0.08) * 0.58 +
          sin(theta * 9.0 - shoreDistance * 0.2) * 0.22;
        float shoreWash = softLine(washPhase, 0.54) * washMask;
        shoreWash += softLine(washPhase * 0.68 + 1.6, 0.7) * washMask * 0.52;
        shoreWash *= 0.84 + (sin(theta * 14.0 + inwardTime * 0.45) * 0.5 + 0.5) * 0.34;

        float surfaceGrain =
          waterNoise(vXZ * 0.2 + radial * inwardTime * 0.22 + tangent * 0.1) - 0.5;
        col += vec3(0.02, 0.08, 0.14) * broadSwell * 0.16;
        col += vec3(surfaceGrain * 0.02);
        col = mix(col, vec3(0.8, 0.96, 1.0), caustics * 0.44);
        col = mix(col, uFoam, saturate(shoreWash * 0.56 + caustics * 0.1));

        float farFade = smoothstep(uIslandR + 18.0, uIslandR + 38.0, r);
        col = mix(col, mix(uSea, uSkyTint, 0.42), farFade * 0.1);
        gl_FragColor = vec4(col, 0.95);
      }
    `,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'student-space-water'
  mesh.position.y = -0.24
  mesh.frustumCulled = false
  mesh.userData.worldAnimatedMaterial = material
  return mesh
}

type CurveUniforms = {
  uCurveK: { value: number }
  uCurveStrength: { value: number }
}

function applyCurvedEarth(
  material: THREE.MeshLambertMaterial,
  curveUniforms: CurveUniforms,
  detailKind: 'sand' | 'dirt',
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
          float r = length(vIslandWorld.xz);
          float soilNoise = islandNoise(vIslandWorld.xz * 9.0);
          float fine = islandNoise(vIslandWorld.xz * 22.0);
          float dryEdge = smoothstep(4.3, 5.35, r);
          detailDiffuse = mix(vec3(0.48, 0.34, 0.16), vec3(0.78, 0.58, 0.28), soilNoise);
          detailDiffuse = mix(detailDiffuse, vec3(0.96, 0.78, 0.38), dryEdge * 0.44);
          detailDiffuse += vec3((fine - 0.5) * 0.08);
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

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function islandNormalAt(x: number, z: number): [number, number, number] {
  return normalAt(x, z)
}
