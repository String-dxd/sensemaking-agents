import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WORLD_ASSETS } from './assets'
import { addWorldHitTarget, attachWorldHotspot, hotspotForValueTree } from './hotspots'
import { islandHeightAt, positionOnIsland } from './island'
import type { ValueTreeDescriptor, ValueTreeSpecies } from './vipsWorldMapping'
import { WORLD_STYLE } from './worldStyle'

const OAK_COLOR_A = WORLD_STYLE.foliage.oakColorA
const OAK_COLOR_B = WORLD_STYLE.foliage.oakColorB
const CHERRY_COLOR_A = WORLD_STYLE.foliage.cherryColorA
const CHERRY_COLOR_B = WORLD_STYLE.foliage.cherryColorB
const LEAVES_PER_BLOB = WORLD_STYLE.foliage.leavesPerBlob
const PLANE_SIZE = WORLD_STYLE.foliage.planeSize
const ALPHA_THRESHOLD = WORLD_STYLE.foliage.alphaThreshold
const GLB_ICO_RADIUS = WORLD_STYLE.foliage.icoRadius
const TREE_ROOT_SINK = 0.075

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/world/draco/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)
const treeTemplateCache = new Map<ValueTreeSpecies, Promise<StudentSpaceTreeTemplate>>()
let leafClusterGeometry: THREE.BufferGeometry | null = null

export type StudentSpaceTreePlacement = {
  species: 'oak' | 'cherry'
  x: number
  z: number
  scale: number
  yaw: number
}

export const STUDENT_SPACE_TREE_PLACEMENTS: readonly StudentSpaceTreePlacement[] = [
  { species: 'oak', x: 0, z: 0, scale: 0.58, yaw: 0 },
  { species: 'oak', x: -2.1, z: -1.6, scale: 0.52, yaw: 0.85 },
  { species: 'cherry', x: 2.4, z: -1.1, scale: 0.5, yaw: 1.6 },
  { species: 'cherry', x: -1.8, z: 2.1, scale: 0.56, yaw: -0.7 },
  { species: 'oak', x: 1.6, z: 2.4, scale: 0.54, yaw: 2.35 },
  { species: 'oak', x: -3.2, z: 0.3, scale: 0.6, yaw: -1.3 },
  { species: 'cherry', x: 3, z: 0.9, scale: 0.48, yaw: 2.2 },
]

export function createValueTree(
  tree: ValueTreeDescriptor,
  foliageTexture?: THREE.Texture,
  placement?: StudentSpaceTreePlacement,
): THREE.Group {
  const group = new THREE.Group()
  group.name = tree.id
  const isInteractive = !tree.claimId.startsWith('student-space.decorative')
  if (isInteractive) attachWorldHotspot(group, hotspotForValueTree(tree))
  if (placement) {
    group.position.set(placement.x, islandHeightAt(placement.x, placement.z), placement.z)
    group.rotation.y = placement.yaw
    group.scale.setScalar(placement.scale)
  } else {
    group.position.copy(positionOnIsland(tree.placementSeed, 0.94))
    group.position.y -= TREE_ROOT_SINK
    group.rotation.y = ((tree.placementSeed % 360) * Math.PI) / 180
    group.scale.setScalar(treeScale(tree))
  }

  const assetSpecies = placement?.species ?? studentSpaceAssetSpecies(tree.species)
  if (assetSpecies && foliageTexture) {
    void hydrateStudentSpaceTree(group, tree, assetSpecies, foliageTexture, isInteractive)
    return group
  }

  group.add(createFallbackTree(tree))
  if (isInteractive) addTreeHitTarget(group)
  return group
}

export function tickStudentSpaceTrees(
  root: THREE.Object3D,
  time: number,
  sunDir: THREE.Vector3,
  windGust: number,
  windRotation = WORLD_STYLE.motion.leafFlutter,
) {
  root.traverse((object) => {
    const material = object.userData.worldLeafMaterial
    if (!isLeafMaterial(material)) return
    material.uniforms.uSunDir.value.copy(sunDir)
    material.uniforms.uTime.value = time
    material.uniforms.uWindGust.value = windGust
    material.uniforms.uWindRotation.value = windRotation
  })
}

function treeScale(tree: ValueTreeDescriptor): number {
  const strengthScale = tree.strength === 'high' ? 0.05 : tree.strength === 'medium' ? 0.025 : 0
  const evidenceScale = Math.min(0.05, tree.evidenceCount * 0.012)
  const pendingScale = tree.evidenceState === 'pending' ? -0.04 : 0
  return 0.5 + strengthScale + evidenceScale + pendingScale
}

function studentSpaceAssetSpecies(species: ValueTreeSpecies): 'oak' | 'cherry' | null {
  if (species === 'oak') return 'oak'
  if (species === 'cherry') return 'cherry'
  return null
}

async function hydrateStudentSpaceTree(
  group: THREE.Group,
  tree: ValueTreeDescriptor,
  species: 'oak' | 'cherry',
  foliageTexture: THREE.Texture,
  isInteractive: boolean,
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
      getLeafClusterGeometry(),
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

    if (isInteractive) addTreeHitTarget(group)
    if (tree.evidenceState === 'pending') leafMaterial.uniforms.uOpacity.value = 0.62
  } catch {
    group.add(createFallbackTree(tree))
    if (isInteractive) addTreeHitTarget(group)
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
    bodyTexture.magFilter = THREE.NearestFilter
    bodyTexture.minFilter = THREE.NearestFilter
    bodyTexture.generateMipmaps = false
    bodyTexture.needsUpdate = true
  }

  const bodyMaterial = new THREE.MeshLambertMaterial({
    map: bodyTexture,
    color: bodyTexture ? 0xffffff : 0x73543c,
    flatShading: true,
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

export function getLeafClusterGeometry(): THREE.BufferGeometry {
  leafClusterGeometry ??= buildLeafClusterGeometry()
  return leafClusterGeometry
}

function buildLeafClusterGeometry(): THREE.BufferGeometry {
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

export function makeLeavesMaterial(
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
      uWindRotation: { value: 1 },
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
      uniform float uWindRotation;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vShadingN;
      void main() {
        float a = sin(uTime * 0.70 + vWorldPos.x * 0.35 + vWorldPos.z * 0.22);
        float b = cos(uTime * 0.55 + vWorldPos.x * 0.30 + vWorldPos.z * 0.48);
        float rot = (a + b) * 0.40 * uWindGust * uWindRotation;
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
    transparent: false,
  }) as LeafMaterial
}

function createFallbackTree(tree: ValueTreeDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = `${tree.id}-procedural-fallback`

  const trunkHeight = trunkHeightForSpecies(tree.species)
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, trunkBaseRadius(tree.species), trunkHeight, 12),
    new THREE.MeshLambertMaterial({ color: 0x73543c, flatShading: false }),
  )
  trunk.position.y = trunkHeight / 2
  if (tree.species === 'palm') trunk.rotation.z = -0.16
  group.add(trunk)
  addSpeciesRoots(group, tree.species)

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
  if (tree.species === 'willow') addWillowDroop(group, tree.color, tree.evidenceState === 'pending')
  if (tree.species === 'palm') addPalmFronds(group, tree.color, tree.evidenceState === 'pending')

  return group
}

function canopyLayout(species: ValueTreeSpecies) {
  if (species === 'mangrove') {
    return [
      { x: 0, y: 0.72, z: 0, radius: 0.46, height: 0.5, scaleX: 1.24, scaleY: 0.78, scaleZ: 1.08 },
      {
        x: -0.24,
        y: 0.68,
        z: 0.08,
        radius: 0.3,
        height: 0.35,
        scaleX: 1.1,
        scaleY: 0.72,
        scaleZ: 0.95,
      },
      {
        x: 0.24,
        y: 0.7,
        z: -0.04,
        radius: 0.32,
        height: 0.35,
        scaleX: 1.1,
        scaleY: 0.74,
        scaleZ: 0.95,
      },
    ]
  }
  if (species === 'pine') {
    return [
      { x: 0, y: 0.86, z: 0, radius: 0.48, height: 0.8, scaleX: 1, scaleY: 1, scaleZ: 1 },
      { x: 0, y: 1.2, z: 0, radius: 0.34, height: 0.64, scaleX: 1, scaleY: 1, scaleZ: 1 },
      { x: 0, y: 1.48, z: 0, radius: 0.22, height: 0.45, scaleX: 1, scaleY: 1, scaleZ: 1 },
    ]
  }
  if (species === 'palm') {
    return [
      {
        x: -0.16,
        y: 1.24,
        z: 0,
        radius: 0.28,
        height: 0.4,
        scaleX: 1.55,
        scaleY: 0.25,
        scaleZ: 0.72,
      },
      {
        x: 0.18,
        y: 1.22,
        z: 0,
        radius: 0.28,
        height: 0.4,
        scaleX: 1.55,
        scaleY: 0.25,
        scaleZ: 0.72,
      },
    ]
  }
  if (species === 'maple') {
    return [
      { x: 0, y: 0.92, z: 0, radius: 0.46, height: 0.5, scaleX: 1.36, scaleY: 0.7, scaleZ: 1.08 },
      {
        x: -0.26,
        y: 0.86,
        z: 0.08,
        radius: 0.3,
        height: 0.4,
        scaleX: 1.08,
        scaleY: 0.72,
        scaleZ: 1,
      },
      {
        x: 0.28,
        y: 0.86,
        z: -0.08,
        radius: 0.3,
        height: 0.4,
        scaleX: 1.08,
        scaleY: 0.72,
        scaleZ: 1,
      },
    ]
  }
  if (species === 'willow') {
    return [
      { x: 0, y: 0.98, z: 0, radius: 0.5, height: 0.5, scaleX: 1.05, scaleY: 0.82, scaleZ: 1.05 },
      {
        x: -0.2,
        y: 0.82,
        z: 0.05,
        radius: 0.34,
        height: 0.4,
        scaleX: 0.85,
        scaleY: 0.78,
        scaleZ: 0.85,
      },
      {
        x: 0.22,
        y: 0.83,
        z: -0.04,
        radius: 0.34,
        height: 0.4,
        scaleX: 0.85,
        scaleY: 0.78,
        scaleZ: 0.85,
      },
    ]
  }
  if (species === 'banyan') {
    return [
      { x: 0, y: 0.96, z: 0, radius: 0.5, height: 0.5, scaleX: 1.36, scaleY: 0.82, scaleZ: 1.18 },
      {
        x: -0.32,
        y: 0.82,
        z: 0.08,
        radius: 0.34,
        height: 0.4,
        scaleX: 1.05,
        scaleY: 0.72,
        scaleZ: 0.95,
      },
      {
        x: 0.34,
        y: 0.83,
        z: -0.08,
        radius: 0.34,
        height: 0.4,
        scaleX: 1.05,
        scaleY: 0.72,
        scaleZ: 0.95,
      },
      {
        x: 0.04,
        y: 0.74,
        z: 0.28,
        radius: 0.28,
        height: 0.35,
        scaleX: 1,
        scaleY: 0.68,
        scaleZ: 0.9,
      },
    ]
  }
  return [
    { x: 0, y: 0.92, z: 0, radius: 0.5, height: 0.5, scaleX: 1, scaleY: 0.9, scaleZ: 1 },
    { x: -0.22, y: 0.82, z: 0.05, radius: 0.34, height: 0.4, scaleX: 1, scaleY: 0.8, scaleZ: 1 },
    { x: 0.24, y: 0.84, z: -0.04, radius: 0.32, height: 0.4, scaleX: 1, scaleY: 0.8, scaleZ: 1 },
  ]
}

function trunkHeightForSpecies(species: ValueTreeSpecies): number {
  if (species === 'palm') return 1.18
  if (species === 'mangrove') return 0.62
  if (species === 'banyan') return 0.72
  return 0.82
}

function trunkBaseRadius(species: ValueTreeSpecies): number {
  if (species === 'banyan') return 0.22
  if (species === 'mangrove') return 0.19
  if (species === 'palm') return 0.12
  return 0.16
}

function addSpeciesRoots(group: THREE.Group, species: ValueTreeSpecies) {
  if (species !== 'mangrove' && species !== 'banyan') return
  const material = new THREE.MeshLambertMaterial({ color: 0x6c4d32, flatShading: false })
  const count = species === 'banyan' ? 8 : 6
  for (let i = 0; i < count; i += 1) {
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.5, 7), material)
    const angle = (i / count) * Math.PI * 2
    root.position.set(Math.cos(angle) * 0.18, 0.19, Math.sin(angle) * 0.18)
    root.rotation.z = Math.cos(angle) * 0.72
    root.rotation.x = -Math.sin(angle) * 0.72
    group.add(root)
  }
}

function addWillowDroop(group: THREE.Group, color: string, pending: boolean) {
  const material = new THREE.MeshLambertMaterial({
    color,
    transparent: pending,
    opacity: pending ? 0.45 : 0.75,
  })
  for (let i = 0; i < 10; i += 1) {
    const strand = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.56, 4, 8), material)
    const angle = (i / 10) * Math.PI * 2
    strand.position.set(Math.cos(angle) * 0.38, 0.62, Math.sin(angle) * 0.28)
    strand.rotation.z = Math.cos(angle) * 0.24
    strand.rotation.x = -Math.sin(angle) * 0.24
    group.add(strand)
  }
}

function addPalmFronds(group: THREE.Group, color: string, pending: boolean) {
  const material = new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: pending,
    opacity: pending ? 0.5 : 0.9,
  })
  for (let i = 0; i < 7; i += 1) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.72), material)
    const angle = (i / 7) * Math.PI * 2
    frond.position.set(Math.cos(angle) * 0.22, 1.18, Math.sin(angle) * 0.22)
    frond.rotation.set(0.72, angle, 0)
    group.add(frond)
  }
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
  uWindRotation: { value: number }
  uOpacity: { value: number }
}

export type LeafMaterial = THREE.ShaderMaterial & {
  uniforms: LeafUniforms
}
