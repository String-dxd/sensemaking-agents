import * as THREE from 'three'
import {
  islandHeightAt,
  islandNormalAt,
  isOnPlateau,
  STUDENT_SPACE_ISLAND_CHUNK_SIZE,
  STUDENT_SPACE_ISLAND_TEXTURE_SIZE,
} from './island'
import { WORLD_STYLE } from './worldStyle'

const CURVE_K = 0.13
const CURVE_STRENGTH = 0.65
const DETAILS = 200
const SIZE = 16
const FRAGMENT_SIZE = SIZE / DETAILS
const BLADE_WIDTH_RATIO = 1.5
const BLADE_HEIGHT_RATIO = 4
const BLADE_HEIGHT_RANDOMNESS = 0.5
const POSITION_RANDOMNESS = 0.5
const GRASS_WIND_TEXTURE_SPEED = WORLD_STYLE.grass.windTextureSpeed
const GRASS_WIND_AMPLITUDE = WORLD_STYLE.grass.windAmplitude

export function createGrass(): THREE.Mesh {
  const geometry = buildGrassGeometry()
  const terrainTexture = createTerrainTexture()
  const noiseTexture = createNoiseTexture()
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGrassDistance: { value: WORLD_STYLE.grass.distance },
      uPlayerPosition: { value: new THREE.Vector3() },
      uTerrainSize: { value: STUDENT_SPACE_ISLAND_CHUNK_SIZE },
      uTerrainTextureSize: { value: STUDENT_SPACE_ISLAND_TEXTURE_SIZE },
      uTerrainATexture: { value: terrainTexture },
      uTerrainAOffset: {
        value: new THREE.Vector2(
          -STUDENT_SPACE_ISLAND_CHUNK_SIZE * 0.5,
          -STUDENT_SPACE_ISLAND_CHUNK_SIZE * 0.5,
        ),
      },
      uTerrainBTexture: { value: terrainTexture },
      uTerrainBOffset: { value: new THREE.Vector2(SIZE * 100, SIZE * 100) },
      uTerrainCTexture: { value: terrainTexture },
      uTerrainCOffset: { value: new THREE.Vector2(SIZE * 100, SIZE * 100) },
      uTerrainDTexture: { value: terrainTexture },
      uTerrainDOffset: { value: new THREE.Vector2(SIZE * 100, SIZE * 100) },
      uNoiseTexture: { value: noiseTexture },
      uFresnelOffset: { value: WORLD_STYLE.grass.fresnelOffset },
      uFresnelScale: { value: WORLD_STYLE.grass.fresnelScale },
      uFresnelPower: { value: WORLD_STYLE.grass.fresnelPower },
      uSunPosition: { value: new THREE.Vector3(-0.5, -0.5, -0.5) },
      uCameraFadeNear: { value: WORLD_STYLE.grass.cameraFadeNear },
      uCameraFadeFar: { value: WORLD_STYLE.grass.cameraFadeFar },
      uCurveK: { value: CURVE_K },
      uCurveStrength: { value: CURVE_STRENGTH },
      uWindGust: { value: 0.7 },
    },
    vertexShader: GRASS_VERTEX,
    fragmentShader: GRASS_FRAGMENT,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'student-space-grass'
  mesh.frustumCulled = false
  mesh.userData.worldAnimatedMaterial = material
  mesh.userData.worldAnimatedKind = 'grass'
  mesh.userData.worldGrassTextures = [terrainTexture, noiseTexture]
  return mesh
}

function buildGrassGeometry(): THREE.BufferGeometry {
  const placements: number[] = []
  const rng = mulberry32(5813)
  for (let iX = 0; iX < DETAILS; iX += 1) {
    const fragmentX = (iX / DETAILS - 0.5) * SIZE + FRAGMENT_SIZE * 0.5
    for (let iZ = 0; iZ < DETAILS; iZ += 1) {
      const fragmentZ = (iZ / DETAILS - 0.5) * SIZE + FRAGMENT_SIZE * 0.5
      const centerX = fragmentX + (rng() - 0.5) * FRAGMENT_SIZE * POSITION_RANDOMNESS
      const centerZ = fragmentZ + (rng() - 0.5) * FRAGMENT_SIZE * POSITION_RANDOMNESS
      if (isOnPlateau(centerX, centerZ)) placements.push(centerX, centerZ)
    }
  }

  const count = placements.length / 2
  const centers = new Float32Array(count * 3 * 2)
  const positions = new Float32Array(count * 3 * 3)
  const tipness = new Float32Array(count * 3)

  for (let index = 0; index < count; index += 1) {
    const centerX = placements[index * 2] ?? 0
    const centerZ = placements[index * 2 + 1] ?? 0
    const bladeWidth = FRAGMENT_SIZE * BLADE_WIDTH_RATIO
    const bladeHalfWidth = bladeWidth * 0.5
    const bladeHeight =
      FRAGMENT_SIZE *
      BLADE_HEIGHT_RATIO *
      (1 - BLADE_HEIGHT_RANDOMNESS + rng() * BLADE_HEIGHT_RANDOMNESS)

    const iStride6 = index * 6
    const iStride9 = index * 9
    const iStride3 = index * 3
    centers[iStride6] = centerX
    centers[iStride6 + 1] = centerZ
    centers[iStride6 + 2] = centerX
    centers[iStride6 + 3] = centerZ
    centers[iStride6 + 4] = centerX
    centers[iStride6 + 5] = centerZ

    positions[iStride9] = -bladeHalfWidth
    positions[iStride9 + 1] = 0
    positions[iStride9 + 2] = 0
    positions[iStride9 + 3] = 0
    positions[iStride9 + 4] = bladeHeight
    positions[iStride9 + 5] = 0
    positions[iStride9 + 6] = bladeHalfWidth
    positions[iStride9 + 7] = 0
    positions[iStride9 + 8] = 0

    tipness[iStride3] = 0
    tipness[iStride3 + 1] = 1
    tipness[iStride3 + 2] = 0
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('center', new THREE.Float32BufferAttribute(centers, 2))
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aTipness', new THREE.Float32BufferAttribute(tipness, 1))
  return geometry
}

function createTerrainTexture(): THREE.DataTexture {
  const size = STUDENT_SPACE_ISLAND_TEXTURE_SIZE
  const data = new Float32Array(size * size * 4)
  for (let iz = 0; iz < size; iz += 1) {
    const z = (iz / (size - 1) - 0.5) * STUDENT_SPACE_ISLAND_CHUNK_SIZE
    for (let ix = 0; ix < size; ix += 1) {
      const x = (ix / (size - 1) - 0.5) * STUDENT_SPACE_ISLAND_CHUNK_SIZE
      const [nx, ny, nz] = islandNormalAt(x, z)
      const offset = (iz * size + ix) * 4
      data[offset] = nx
      data[offset + 1] = ny
      data[offset + 2] = nz
      data[offset + 3] = islandHeightAt(x, z)
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

function createNoiseTexture(): THREE.DataTexture {
  const size = 128
  const frequency = 8
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = ((x + 0.5) / size) * frequency
      const v = ((y + 0.5) / size) * frequency
      const offset = (y * size + x) * 4
      data[offset] = noiseByte(periodicPerlin3(u, v, 123.456, frequency))
      data[offset + 1] = noiseByte(periodicPerlin3(u, v, 456.789, frequency))
      data[offset + 2] = noiseByte(periodicPerlin3(u, v, 789.123, frequency))
      data[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function noiseByte(value: number): number {
  return Math.round(THREE.MathUtils.clamp(value * 0.5 + 0.5, 0, 1) * 255)
}

function periodicPerlin3(x: number, y: number, z: number, period: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const xf = x - x0
  const yf = y - y0
  const zf = z - z0
  const x1 = x0 + 1
  const y1 = y0 + 1
  const z1 = z0 + 1
  const u = fade(xf)
  const v = fade(yf)
  const w = fade(zf)

  const n000 = gradientDot(x0, y0, z0, period, xf, yf, zf)
  const n100 = gradientDot(x1, y0, z0, period, xf - 1, yf, zf)
  const n010 = gradientDot(x0, y1, z0, period, xf, yf - 1, zf)
  const n110 = gradientDot(x1, y1, z0, period, xf - 1, yf - 1, zf)
  const n001 = gradientDot(x0, y0, z1, period, xf, yf, zf - 1)
  const n101 = gradientDot(x1, y0, z1, period, xf - 1, yf, zf - 1)
  const n011 = gradientDot(x0, y1, z1, period, xf, yf - 1, zf - 1)
  const n111 = gradientDot(x1, y1, z1, period, xf - 1, yf - 1, zf - 1)

  const x00 = lerp(n000, n100, u)
  const x10 = lerp(n010, n110, u)
  const x01 = lerp(n001, n101, u)
  const x11 = lerp(n011, n111, u)
  const y0Mix = lerp(x00, x10, v)
  const y1Mix = lerp(x01, x11, v)
  return lerp(y0Mix, y1Mix, w) * 1.45
}

function gradientDot(
  x: number,
  y: number,
  z: number,
  period: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  const gradient =
    GRADIENTS[
      hash3(positiveMod(x, period), positiveMod(y, period), positiveMod(z, period)) %
        GRADIENTS.length
    ]
  if (!gradient) return 0
  return gradient[0] * dx + gradient[1] * dy + gradient[2] * dz
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x + 374761393, 668265263)
  h ^= Math.imul(y + 2246822519, 3266489917)
  h ^= Math.imul(z + 3266489917, 668265263)
  h ^= h >>> 13
  h = Math.imul(h, 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function positiveMod(value: number, period: number): number {
  return ((value % period) + period) % period
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

const GRADIENTS: readonly (readonly [number, number, number])[] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
]

const GRASS_VERTEX = `
#define M_PI 3.1415926535897932384626433832795

uniform float uTime;
uniform float uGrassDistance;
uniform vec3 uPlayerPosition;
uniform float uTerrainSize;
uniform float uTerrainTextureSize;
uniform sampler2D uTerrainATexture;
uniform vec2 uTerrainAOffset;
uniform sampler2D uTerrainBTexture;
uniform vec2 uTerrainBOffset;
uniform sampler2D uTerrainCTexture;
uniform vec2 uTerrainCOffset;
uniform sampler2D uTerrainDTexture;
uniform vec2 uTerrainDOffset;
uniform sampler2D uNoiseTexture;
uniform float uFresnelOffset;
uniform float uFresnelScale;
uniform float uFresnelPower;
uniform vec3 uSunPosition;
uniform float uCurveK;
uniform float uCurveStrength;
uniform float uCameraFadeNear;
uniform float uCameraFadeFar;
uniform float uWindGust;

attribute vec2 center;
attribute float aTipness;

varying vec3 vColor;

float inverseLerp(float v, float minValue, float maxValue) {
  return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
  float t = inverseLerp(v, inMin, inMax);
  return mix(outMin, outMax, t);
}

float getSunShade(vec3 normal) {
  float sunShade = dot(normal, -uSunPosition);
  sunShade = sunShade * 0.5 + 0.5;
  return sunShade;
}

vec3 getSunShadeColor(vec3 baseColor, float sunShade) {
  vec3 shadeColor = baseColor * vec3(0.0, 0.5, 0.7);
  return mix(baseColor, shadeColor, sunShade);
}

float getSunReflection(vec3 viewDirection, vec3 worldNormal, vec3 viewNormal) {
  vec3 sunViewReflection = reflect(uSunPosition, viewNormal);
  float sunViewStrength = max(0.2, dot(sunViewReflection, viewDirection));
  float fresnel = uFresnelOffset + uFresnelScale * (1.0 + dot(viewDirection, worldNormal));
  float sunReflection = fresnel * sunViewStrength;
  sunReflection = pow(sunReflection, uFresnelPower);
  return sunReflection;
}

vec3 getSunReflectionColor(vec3 baseColor, float sunReflection) {
  return mix(baseColor, vec3(1.0, 1.0, 1.0), clamp(sunReflection, 0.0, 1.0));
}

float getGrassAttenuation(vec2 grassPosition) {
  float distanceAttenuation = distance(uPlayerPosition.xz, grassPosition) / uGrassDistance * 2.0;
  return 1.0 - clamp(0.0, 1.0, smoothstep(0.3, 1.0, distanceAttenuation));
}

vec2 getRotatePivot2d(vec2 uv, float rotation, vec2 pivot) {
  return vec2(
    cos(rotation) * (uv.x - pivot.x) + sin(rotation) * (uv.y - pivot.y) + pivot.x,
    cos(rotation) * (uv.y - pivot.y) - sin(rotation) * (uv.x - pivot.x) + pivot.y
  );
}

void main() {
  vec2 newCenter = center;
  newCenter -= uPlayerPosition.xz;
  float halfSize = uGrassDistance * 0.5;
  newCenter.x = mod(newCenter.x + halfSize, uGrassDistance) - halfSize;
  newCenter.y = mod(newCenter.y + halfSize, uGrassDistance) - halfSize;
  vec4 modelCenter = modelMatrix * vec4(newCenter.x, 0.0, newCenter.y, 1.0);

  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  modelPosition.xz += newCenter;

  float angleToCamera = atan(modelCenter.x - cameraPosition.x, modelCenter.z - cameraPosition.z);
  modelPosition.xz = getRotatePivot2d(modelPosition.xz, angleToCamera, modelCenter.xz);

  vec2 terrainAUv = (modelPosition.xz - uTerrainAOffset.xy) / uTerrainSize;
  vec2 terrainBUv = (modelPosition.xz - uTerrainBOffset.xy) / uTerrainSize;
  vec2 terrainCUv = (modelPosition.xz - uTerrainCOffset.xy) / uTerrainSize;
  vec2 terrainDUv = (modelPosition.xz - uTerrainDOffset.xy) / uTerrainSize;

  float fragmentSize = 1.0 / uTerrainTextureSize;
  vec4 terrainAColor = texture2D(uTerrainATexture, terrainAUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
  vec4 terrainBColor = texture2D(uTerrainBTexture, terrainBUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
  vec4 terrainCColor = texture2D(uTerrainCTexture, terrainCUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
  vec4 terrainDColor = texture2D(uTerrainDTexture, terrainDUv * (1.0 - fragmentSize) + fragmentSize * 0.5);

  vec4 terrainData = vec4(0.0);
  terrainData += step(0.0, terrainAUv.x) * step(terrainAUv.x, 1.0) * step(0.0, terrainAUv.y) * step(terrainAUv.y, 1.0) * terrainAColor;
  terrainData += step(0.0, terrainBUv.x) * step(terrainBUv.x, 1.0) * step(0.0, terrainBUv.y) * step(terrainBUv.y, 1.0) * terrainBColor;
  terrainData += step(0.0, terrainCUv.x) * step(terrainCUv.x, 1.0) * step(0.0, terrainCUv.y) * step(terrainCUv.y, 1.0) * terrainCColor;
  terrainData += step(0.0, terrainDUv.x) * step(terrainDUv.x, 1.0) * step(0.0, terrainDUv.y) * step(terrainDUv.y, 1.0) * terrainDColor;

  vec3 normal = terrainData.rgb;
  modelPosition.y += terrainData.a;
  modelCenter.y += terrainData.a;

  modelPosition.y -= dot(modelPosition.xz, modelPosition.xz) * (uCurveK * uCurveK) * uCurveStrength;
  modelCenter.y -= dot(modelCenter.xz, modelCenter.xz) * (uCurveK * uCurveK) * uCurveStrength;

  float slope = 1.0 - abs(dot(vec3(0.0, 1.0, 0.0), normal));
  float distanceScale = getGrassAttenuation(modelCenter.xz);
  float slopeScale = smoothstep(remap(slope, 0.4, 0.5, 1.0, 0.0), 0.0, 1.0);
  float cameraDist = distance(cameraPosition, modelCenter.xyz);
  float cameraScale = 1.0 - smoothstep(uCameraFadeNear, uCameraFadeFar, cameraDist);
  float scale = distanceScale * slopeScale * cameraScale;
  modelPosition.xyz = mix(modelCenter.xyz, modelPosition.xyz, scale);

  vec2 noiseUv = modelPosition.xz * 0.02 + uTime * ${GRASS_WIND_TEXTURE_SPEED.toFixed(3)};
  vec4 noiseColor = texture2D(uNoiseTexture, noiseUv);
  float windAmp = ${GRASS_WIND_AMPLITUDE.toFixed(2)} * uWindGust;
  modelPosition.x += (noiseColor.x - 0.5) * windAmp * aTipness * scale;
  modelPosition.z += (noiseColor.y - 0.5) * windAmp * aTipness * scale;

  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;

  vec3 viewDirection = normalize(modelPosition.xyz - cameraPosition);
  vec3 worldNormal = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
  vec3 viewNormal = normalize(normalMatrix * normal);

  vec3 grassDefaultColor = vec3(0.29, 0.56, 0.25);
  vec3 grassShadedColor = grassDefaultColor / 1.3;
  vec3 lowColor = mix(grassShadedColor, grassDefaultColor, 1.0 - scale);
  vec3 color = mix(lowColor, grassDefaultColor, aTipness);

  float sunShade = getSunShade(normal);
  color = getSunShadeColor(color, sunShade);

  float sunReflection = getSunReflection(viewDirection, worldNormal, viewNormal);
  color = getSunReflectionColor(color, sunReflection);

  vColor = color;
}
`

const GRASS_FRAGMENT = `
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
