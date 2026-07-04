// Structural three.js typing (plan 011 step 4 — reviewer note: "keep the
// injected-THREE typing structural, not `typeof import('three')`, which pins a
// version"). The runtime never imports three; the host injects its own
// namespace, and these interfaces describe ONLY the members the runtime calls.
//
// Because interfaces are structural, three's real classes (r149 … r185+) are
// assignable to these — a class with MORE methods satisfies one that asks for
// fewer. `test/three-assignable.test.ts` proves `import * as THREE` from BOTH
// version aliases is assignable to `ThreeNamespace`.

export interface Vec3Like {
  x: number
  y: number
  z: number
  set(x: number, y: number, z: number): this
  copy(v: Vec3Like): this
  clone(): Vec3Like
  add(v: Vec3Like): this
  sub(v: Vec3Like): this
  multiplyScalar(s: number): this
  addScaledVector(v: Vec3Like, s: number): this
  divideScalar(s: number): this
  lerp(v: Vec3Like, alpha: number): this
  normalize(): this
  length(): number
  lengthSq(): number
  applyMatrix4(m: Mat4Like): this
  applyQuaternion(q: QuatLike): this
  setFromMatrixPosition(m: Mat4Like): this
  setFromMatrixScale(m: Mat4Like): this
}

export interface QuatLike {
  x: number
  y: number
  z: number
  w: number
  copy(q: QuatLike): this
  clone(): QuatLike
  invert(): this
  multiply(q: QuatLike): this
  setFromUnitVectors(from: Vec3Like, to: Vec3Like): this
  setFromEuler(e: EulerLike): this
}

export interface Mat4Like {
  elements: number[] | Float32Array
  copy(m: Mat4Like): this
  identity(): this
  compose(pos: Vec3Like, quat: QuatLike, scale: Vec3Like): this
  decompose(pos: Vec3Like, quat: QuatLike, scale: Vec3Like): this
  multiplyMatrices(a: Mat4Like, b: Mat4Like): this
  makeScale(x: number, y: number, z: number): this
  fromArray(array: ArrayLike<number>, offset?: number): this
}

export interface EulerLike {
  x: number
  y: number
  z: number
  order: string
  set(x: number, y: number, z: number, order?: string): this
}

export interface Vec2Like {
  x: number
  y: number
  set(x: number, y: number): this
}

export interface TextureLike {
  offset: Vec2Like
  repeat: Vec2Like
  needsUpdate: boolean
  clone(): TextureLike
}

export interface MaterialLike {
  map?: TextureLike | null
  visible?: boolean
  userData: Record<string, unknown>
}

export interface Object3DLike {
  name: string
  visible: boolean
  position: Vec3Like
  quaternion: QuatLike
  scale: Vec3Like
  rotation: EulerLike
  matrixWorld: Mat4Like
  parent: Object3DLike | null
  children: Object3DLike[]
  userData: Record<string, unknown>
  material?: MaterialLike | MaterialLike[]
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void
  traverse(callback: (o: Object3DLike) => void): void
  getObjectByName(name: string): Object3DLike | undefined
  add(...objects: Object3DLike[]): this
  getWorldPosition(target: Vec3Like): Vec3Like
}

// --- animation (clip state machine) ------------------------------------------

export interface KeyframeTrackLike {
  name: string
  times: ArrayLike<number>
  values: number[] | Float32Array
}

export interface AnimationClipLike {
  name: string
  duration: number
  tracks: KeyframeTrackLike[]
  blendMode?: number
  clone(): AnimationClipLike
}

export interface AnimationActionLike {
  enabled: boolean
  clampWhenFinished: boolean
  time: number
  reset(): this
  play(): this
  stop(): this
  setLoop(mode: number, repetitions: number): this
  setEffectiveWeight(weight: number): this
  setEffectiveTimeScale(scale: number): this
  crossFadeFrom(other: AnimationActionLike, duration: number, warp: boolean): this
  getClip(): AnimationClipLike
  getEffectiveWeight(): number
  isRunning(): boolean
}

export interface AnimationMixerLike {
  clipAction(clip: AnimationClipLike): AnimationActionLike
  update(dt: number): this
  uncacheClip(clip: AnimationClipLike): void
}

// --- the injected namespace ---------------------------------------------------

export interface ThreeNamespace {
  Vector3: { new (x?: number, y?: number, z?: number): Vec3Like }
  Quaternion: { new (x?: number, y?: number, z?: number, w?: number): QuatLike }
  Matrix4: { new (): Mat4Like }
  // biome-ignore lint/suspicious/noExplicitAny: three's mixer ctor requires a
  // full Object3D (60+ members); the runtime always passes the real parsed
  // scene. `any` here keeps the namespace assignable without version-pinning.
  AnimationMixer: { new (root: any): AnimationMixerLike }
  AnimationUtils: { makeClipAdditive(clip: AnimationClipLike): AnimationClipLike }
  LoopOnce: number
  LoopRepeat: number
  AdditiveAnimationBlendMode: number
}

/** A parsed GLTFLoader result (host-loaded). Structural: the host's three
 * version's GLTF type satisfies it. */
export interface LoadedGLTF {
  scene: Object3DLike
  animations: AnimationClipLike[]
  parser?: {
    json?: unknown
    associations?: Map<unknown, unknown>
  }
  userData?: Record<string, unknown>
}
