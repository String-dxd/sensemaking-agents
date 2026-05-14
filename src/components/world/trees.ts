import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WORLD_ASSETS } from './assets'
import { addWorldHitTarget, attachWorldHotspot, hotspotForValueTree } from './hotspots'
import { positionOnIsland } from './island'
import type { ValueTreeDescriptor, ValueTreeSpecies } from './vipsWorldMapping'

const OAK_COLOR_A = 0x3a7d2a
const OAK_COLOR_B = 0x8aaa35
const CHERRY_COLOR_A = 0xff66a3
const CHERRY_COLOR_B = 0xffcc66
const LEAVES_PER_BLOB = 80
const PLANE_SIZE = 0.5
const ALPHA_THRESHOLD = 0.32
const GLB_ICO_RADIUS = 1.1
const TREE_ROOT_SINK = 0.075

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/world/draco/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)
const treeTemplateCache = new Map<ValueTreeSpecies, Promise<StudentSpaceTreeTemplate>>()
let leafCloudGeometry: THREE.BufferGeometry | null = null

export function createValueTree(
  tree: ValueTreeDescriptor,
  foliageTexture?: THREE.Texture,
): THREE.Group {
  const group = new THREE.Group()
  group.name = tree.id
  attachWorldHotspot(group, hotspotForValueTree(tree))
  group.position.copy(positionOnIsland(tree.placementSeed, 0.94))
  group.position.y -= TREE_ROOT_SINK
  group.rotation.y = ((tree.placementSeed % 360) * Math.PI) / 180
  group.scale.setScalar(treeScale(tree))

  const assetSpecies = studentSpaceAssetSpecies(tree.species)
  if (assetSpecies && foliageTexture) {
    group.add(createFallbackTree(tree))
    addTreeHitTarget(group)
    void hydrateStudentSpaceTree(group, tree, assetSpecies, foliageTexture)
    return group
  }

  group.add(createFallbackTree(tree))
  addTreeHitTarget(group)
  return group
}

export function tickStudentSpaceTrees(root: THREE.Object3D, time: number, sunDir: THREE.Vector3) {
  root.traverse((object) => {
    const material = object.userData.worldLeafMaterial
    if (!isLeafMaterial(material)) return
    material.uniforms.uSunDir.value.copy(sunDir)
    material.uniforms.uTime.value = time
    material.uniforms.uWindGust.value = 0.68 + Math.sin(time * 0.42) * 0.22
  })
}

function treeScale(tree: ValueTreeDescriptor): number {
  const strengthScale = tree.strength === 'high' ? 0.055 : tree.strength === 'medium' ? 0.028 : 0
  const evidenceScale = Math.min(0.06, tree.evidenceCount * 0.015)
  const pendingScale = tree.evidenceState === 'pending' ? -0.035 : 0
  return 0.3 + strengthScale + evidenceScale + pendingScale
}

function studentSpaceAssetSpecies(species: ValueTreeSpecies): 'oak' | 'cherry' {
  if (species === 'cherry' || species === 'willow') return 'cherry'
  return 'oak'
}

async function hydrateStudentSpaceTree(
  group: THREE.Group,
  tree: ValueTreeDescriptor,
  species: 'oak' | 'cherry',
  foliageTexture: THREE.Texture,
) {
  try {
    const template = await loadTreeTemplate(species, foliageTexture)
    group.clear()

    const trunk = new THREE.Mesh(template.bodyGeometry, template.bodyMaterial)
    trunk.name = `${tree.id}-student-space-trunk`
    trunk.castShadow = true
    trunk.receiveShadow = true
    group.add(trunk)

    const leafMaterial = template.leavesMaterial.clone()
    leafMaterial.uniforms = THREE.UniformsUtils.clone(template.leavesMaterial.uniforms)
    const leaves = new THREE.InstancedMesh(
      getLeafCloudGeometry(),
      leafMaterial,
      template.leafRefs.length,
    )
    leaves.name = `${tree.id}-student-space-leaves`
    leaves.frustumCulled = false
    leaves.userData.worldLeafMaterial = leafMaterial
    template.leafRefs.forEach((ref, index) => {
      leaves.setMatrixAt(
        index,
        new THREE.Matrix4().compose(ref.position, ref.quaternion, ref.scale),
      )
    })
    leaves.instanceMatrix.needsUpdate = true
    group.add(leaves)

    addTreeHitTarget(group)
    if (tree.evidenceState === 'pending') leafMaterial.uniforms.uOpacity.value = 0.62
  } catch {
    // Keep the procedural fallback visible if the asset is unavailable.
  }
}

function addTreeHitTarget(group: THREE.Group) {
  addWorldHitTarget(group, {
    name: `${group.name}-value-hit-target`,
    position: new THREE.Vector3(0, 3.2, 0),
    scale: new THREE.Vector3(1.7, 2.5, 1.7),
    priority: 10,
  })
}

function loadTreeTemplate(
  species: 'oak' | 'cherry',
  foliageTexture: THREE.Texture,
): Promise<StudentSpaceTreeTemplate> {
  const cached = treeTemplateCache.get(species)
  if (cached) return cached

  const asset = species === 'oak' ? WORLD_ASSETS.trees.oak : WORLD_ASSETS.trees.cherry
  const promise = gltfLoader
    .loadAsync(asset.url)
    .then((gltf) =>
      extractTreeTemplate(
        gltf.scene,
        foliageTexture,
        species === 'oak' ? OAK_COLOR_A : CHERRY_COLOR_A,
        species === 'oak' ? OAK_COLOR_B : CHERRY_COLOR_B,
      ),
    )
  treeTemplateCache.set(species, promise)
  return promise
}

function extractTreeTemplate(
  scene: THREE.Object3D,
  foliageTexture: THREE.Texture,
  leafA: number,
  leafB: number,
): StudentSpaceTreeTemplate {
  const extracted: {
    bodyGeometry?: THREE.BufferGeometry
    bodyTexture?: THREE.Texture
  } = {}
  const leafRefs: LeafRef[] = []

  scene.updateMatrixWorld(true)
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    if (child.name.startsWith('treeBody')) {
      extracted.bodyGeometry = mesh.geometry
      const bodyMap = materialMap(mesh.material)
      if (bodyMap) extracted.bodyTexture = bodyMap
    } else if (child.name.startsWith('treeLeaves')) {
      leafRefs.push({
        position: child.position.clone(),
        quaternion: child.quaternion.clone(),
        scale: child.scale.clone().multiplyScalar(GLB_ICO_RADIUS),
      })
    }
  })

  let bodyGeometry = extracted.bodyGeometry
  const bodyTexture = extracted.bodyTexture

  if (!bodyGeometry) {
    bodyGeometry = new THREE.CylinderGeometry(0.16, 0.24, 1.2, 12)
    bodyGeometry.translate(0, 0.6, 0)
  }

  if (bodyTexture) {
    bodyTexture.colorSpace = THREE.SRGBColorSpace
    bodyTexture.magFilter = THREE.LinearFilter
    bodyTexture.minFilter = THREE.LinearFilter
    bodyTexture.generateMipmaps = false
    bodyTexture.needsUpdate = true
  }

  const bodyMaterial = new THREE.MeshLambertMaterial({
    map: bodyTexture,
    color: bodyTexture ? 0xb36b2e : 0x73543c,
    flatShading: false,
    side: THREE.DoubleSide,
  })

  return {
    bodyGeometry,
    bodyMaterial,
    leafRefs,
    leavesMaterial: makeLeavesMaterial(foliageTexture, leafA, leafB),
  }
}

function materialMap(material: THREE.Material | THREE.Material[]): THREE.Texture | null {
  const candidate = Array.isArray(material) ? material[0] : material
  if (!candidate || !('map' in candidate)) return null
  const mapped = candidate as THREE.Material & { map?: unknown }
  return mapped.map instanceof THREE.Texture ? mapped.map : null
}

function getLeafCloudGeometry(): THREE.BufferGeometry {
  leafCloudGeometry ??= buildLeafCloudGeometry()
  return leafCloudGeometry
}

function buildLeafCloudGeometry(): THREE.BufferGeometry {
  const rng = mulberry32(42)
  const planes: THREE.BufferGeometry[] = []
  const centers: number[] = []
  const radials: number[] = []

  for (let i = 0; i < LEAVES_PER_BLOB; i += 1) {
    const plane = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE)
    plane.rotateZ(rng() * Math.PI * 2)

    const theta = Math.PI * 2 * rng()
    const phi = Math.acos(2 * rng() - 1)
    const r = 1 - rng() ** 3
    const px = r * Math.sin(phi) * Math.cos(theta)
    const py = r * Math.cos(phi)
    const pz = r * Math.sin(phi) * Math.sin(theta)
    const radial = new THREE.Vector3(px, py, pz).normalize()

    for (let v = 0; v < 4; v += 1) {
      centers.push(px, py, pz)
      radials.push(radial.x, radial.y, radial.z)
    }
    planes.push(plane)
  }

  const geometry = mergeGeometries(planes)
  planes.forEach((plane) => {
    plane.dispose()
  })
  if (!geometry) return new THREE.BufferGeometry()
  geometry.setAttribute('aPlaneCenter', new THREE.Float32BufferAttribute(centers, 3))
  geometry.setAttribute('aRadial', new THREE.Float32BufferAttribute(radials, 3))
  return geometry
}

function makeLeavesMaterial(
  foliageTexture: THREE.Texture,
  colorA: number,
  colorB: number,
): LeafMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFoliage: { value: foliageTexture },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.85, 0.3).normalize() },
      uTime: { value: 0 },
      uThreshold: { value: ALPHA_THRESHOLD },
      uWindGust: { value: 0.7 },
      uOpacity: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aPlaneCenter;
      attribute vec3 aRadial;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vShadingN;
      void main() {
        vUv = uv;
        mat4 instModel = modelMatrix * instanceMatrix;
        vec3 centerWorld = (instModel * vec4(aPlaneCenter, 1.0)).xyz;
        vec3 toCam = normalize(cameraPosition - centerWorld);
        vec3 worldUp = vec3(0.0, 1.0, 0.0);
        vec3 right = normalize(cross(worldUp, toCam));
        vec3 up = cross(toCam, right);
        float instScale = length(vec3(instModel[0].xyz));
        vec3 worldPos = centerWorld + (position.x * right + position.y * up) * instScale;
        vShadingN = normalize(mat3(instModel) * aRadial);
        vWorldPos = worldPos;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uFoliage;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uThreshold;
      uniform float uWindGust;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vShadingN;
      void main() {
        float a = sin(uTime * 0.70 + vWorldPos.x * 0.35 + vWorldPos.z * 0.22);
        float b = cos(uTime * 0.55 + vWorldPos.x * 0.30 + vWorldPos.z * 0.48);
        float rot = (a + b) * 0.40 * uWindGust;
        float c = cos(rot);
        float s = sin(rot);
        vec2 uv = vUv - 0.5;
        uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
        float alpha = texture2D(uFoliage, uv).r;
        if(alpha < uThreshold) discard;
        float lit = smoothstep(0.0, 1.0, dot(vShadingN, uSunDir));
        vec3 col = mix(uColorA, uColorB, lit);
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  }) as LeafMaterial
}

function createFallbackTree(tree: ValueTreeDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = `${tree.id}-procedural-fallback`

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 0.82, 12),
    new THREE.MeshLambertMaterial({ color: 0x73543c, flatShading: false }),
  )
  trunk.position.y = 0.4
  group.add(trunk)

  for (const canopy of canopyLayout(tree.species)) {
    const geometry =
      tree.species === 'pine'
        ? new THREE.ConeGeometry(canopy.radius, canopy.height, 18)
        : new THREE.SphereGeometry(canopy.radius, 18, 14)
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        color: tree.color,
        flatShading: false,
        transparent: tree.evidenceState === 'pending',
        opacity: tree.evidenceState === 'pending' ? 0.55 : 0.95,
      }),
    )
    mesh.position.set(canopy.x, canopy.y, canopy.z)
    mesh.scale.set(canopy.scaleX, canopy.scaleY, canopy.scaleZ)
    group.add(mesh)
  }

  return group
}

function canopyLayout(species: ValueTreeSpecies) {
  if (species === 'pine') {
    return [
      { x: 0, y: 0.86, z: 0, radius: 0.48, height: 0.8, scaleX: 1, scaleY: 1, scaleZ: 1 },
      { x: 0, y: 1.2, z: 0, radius: 0.34, height: 0.64, scaleX: 1, scaleY: 1, scaleZ: 1 },
    ]
  }
  if (species === 'palm') {
    return [
      {
        x: -0.16,
        y: 1.02,
        z: 0,
        radius: 0.34,
        height: 0.4,
        scaleX: 1.9,
        scaleY: 0.35,
        scaleZ: 0.72,
      },
      {
        x: 0.18,
        y: 1.03,
        z: 0,
        radius: 0.34,
        height: 0.4,
        scaleX: 1.9,
        scaleY: 0.35,
        scaleZ: 0.72,
      },
    ]
  }
  return [
    { x: 0, y: 0.92, z: 0, radius: 0.5, height: 0.5, scaleX: 1, scaleY: 0.9, scaleZ: 1 },
    { x: -0.22, y: 0.82, z: 0.05, radius: 0.34, height: 0.4, scaleX: 1, scaleY: 0.8, scaleZ: 1 },
    { x: 0.24, y: 0.84, z: -0.04, radius: 0.32, height: 0.4, scaleX: 1, scaleY: 0.8, scaleZ: 1 },
  ]
}

function isLeafMaterial(value: unknown): value is LeafMaterial {
  return value instanceof THREE.ShaderMaterial && Boolean(value.uniforms.uFoliage)
}

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

interface LeafRef {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
}

interface StudentSpaceTreeTemplate {
  bodyGeometry: THREE.BufferGeometry
  bodyMaterial: THREE.MeshLambertMaterial
  leafRefs: LeafRef[]
  leavesMaterial: LeafMaterial
}

type LeafUniforms = {
  uFoliage: { value: THREE.Texture }
  uColorA: { value: THREE.Color }
  uColorB: { value: THREE.Color }
  uSunDir: { value: THREE.Vector3 }
  uTime: { value: number }
  uThreshold: { value: number }
  uWindGust: { value: number }
  uOpacity: { value: number }
}

type LeafMaterial = THREE.ShaderMaterial & {
  uniforms: LeafUniforms
}
