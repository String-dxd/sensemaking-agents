// Sculpt delta layer (plan 009, step 2) — the persistence heart of freeform
// authoring. Every sculpt brush and lattice apply writes PER-VERTEX POSITION
// DELTAS over the authored base mesh (fixed topology — plan 000 §2.4; no
// dyntopo, ever). The delta layer:
//
//   - survives re-assembly: assembly clones scenes but SHARES geometries
//     (assemble.ts memory contract), so the mutated position attribute — and
//     this module's WeakMap of base copies — persist across every
//     CharacterRoot reassembly of the same loaded assets;
//   - composes with morph targets: three.js applies glTF morphs IN-SHADER as
//     relative deltas on top of the `position` attribute
//     (`morphTargetsRelative = true`), so writing `base + sculptDelta` into
//     `position` yields `final = base + sculptDelta + Σ wᵢ·morphΔᵢ` — sculpt
//     and sliders stack, no double displacement;
//   - composes with skinning the same way: skinning consumes the (morphed)
//     position attribute, so the sculpted shape deforms with the rig;
//   - serializes sparsely into the spec's reserved `anatomy.sculptDelta`
//     field, quantized to SCULPT_QUANTUM meters (see schema.ts).

import * as THREE from 'three'
import { computeSmoothedNormals, SMOOTHED_NORMAL_ATTRIBUTE } from '../materials/outline'
import type { SculptDeltaLayerPayload, SculptDeltaPayload } from '../spec/schema'

/** Serialization quantum (meters). 1e-5 m = 0.01 mm — far below visible
 * detail at character scale; round-trip error ≤ half a quantum. */
export const SCULPT_QUANTUM = 1e-5

export interface MeshDeltaLayer {
  geometry: THREE.BufferGeometry
  /** Immutable copy of the pristine authored positions (3·N). */
  basePositions: Float32Array
  /** Current sculpt delta (3·N), geometry-local (rest/bind) space. */
  delta: Float32Array
}

/** One sculptable mesh of the assembled character, with stable identity. */
export interface SculptTarget {
  /** Which authored asset the mesh came from: `body-<archetype>` or a part id. */
  assetId: string
  /** Mesh (primitive) name inside that asset — unique per asset by contract. */
  meshName: string
  /** Asset contract version (ASSET-CONTRACT.md `baseMeshVersion`). */
  meshVersion: number
  mesh: THREE.Mesh
  layer: MeshDeltaLayer
  /** Targets sharing a weld space are seam-welded/BFS'd together (step 3). */
  weldSpace: string
  /** Approximate uniform local→world scale (world brush radius conversion). */
  localToWorldScale: number
}

/** Typed load-guard failure (plan 009 step 2: loud, never silent). */
export class SculptDeltaMismatchError extends Error {
  readonly assetId: string
  readonly meshName: string
  readonly reason: 'meshVersion' | 'vertexCount'
  readonly expected: number
  readonly actual: number

  constructor(
    assetId: string,
    meshName: string,
    reason: 'meshVersion' | 'vertexCount',
    expected: number,
    actual: number,
  ) {
    super(
      `sculptDelta: saved sculpt for "${assetId}/${meshName}" expects ${reason} ${expected} but the loaded asset has ${actual} — the authored mesh changed since this character was sculpted (re-sculpt or restore the old asset)`,
    )
    this.name = 'SculptDeltaMismatchError'
    this.assetId = assetId
    this.meshName = meshName
    this.reason = reason
    this.expected = expected
    this.actual = actual
  }
}

// Keyed by geometry so the base copy is captured exactly once per loaded
// asset (geometries are shared across assemblies — see module header).
// Every mutation flows through this layer, so first access sees pristine data.
const layerRegistry = new WeakMap<THREE.BufferGeometry, MeshDeltaLayer>()

export function getDeltaLayer(geometry: THREE.BufferGeometry): MeshDeltaLayer {
  let layer = layerRegistry.get(geometry)
  if (!layer) {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    if (!position) throw new Error('getDeltaLayer: geometry has no position attribute')
    layer = {
      geometry,
      basePositions: new Float32Array(position.array as Float32Array),
      delta: new Float32Array(position.count * 3),
    }
    layerRegistry.set(geometry, layer)
  }
  return layer
}

/**
 * Write `base + delta` into the geometry's position attribute. Pass
 * `indices` to touch only those vertices (drag hot path); omit for a full
 * rewrite (load, undo). Does NOT recompute normals — callers batch that
 * (throttled during drags, exact on release) via `recomputeNormals` or the
 * step-3 welded variant.
 */
export function applyDelta(layer: MeshDeltaLayer, indices?: ArrayLike<number>): void {
  const position = layer.geometry.getAttribute('position') as THREE.BufferAttribute
  const out = position.array as Float32Array
  const { basePositions, delta } = layer
  if (indices) {
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k] * 3
      out[i] = basePositions[i] + delta[i]
      out[i + 1] = basePositions[i + 1] + delta[i + 1]
      out[i + 2] = basePositions[i + 2] + delta[i + 2]
    }
  } else {
    for (let i = 0; i < out.length; i++) out[i] = basePositions[i] + delta[i]
  }
  position.needsUpdate = true
  // Skinned/morphed meshes never frustum-cull (assemble.ts), but keep bounds
  // roughly honest for raycast early-outs.
  layer.geometry.computeBoundingSphere()
}

/**
 * Exact normal recompute for one geometry after its positions changed:
 * angle-weighted face normals accumulated across POSITION-DUPLICATE vertices
 * (UV seams, primitive caps) so sculpting never splits shading at seams —
 * the same merged algorithm the plan-005 outline hull uses. Updates the
 * render `normal` attribute AND, when present, the outline hull's
 * `aSmoothedNormal` attribute (plan 009 step 2 requirement).
 *
 * For smooth organic toon bodies the merged smooth normal IS the intended
 * render normal (the authored GLBs export Blender smooth shading).
 */
export function recomputeNormals(geometry: THREE.BufferGeometry): void {
  const smoothed = computeSmoothedNormals(geometry)
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
  if (normal) {
    ;(normal.array as Float32Array).set(smoothed.array as Float32Array)
    normal.needsUpdate = true
  } else {
    geometry.setAttribute('normal', smoothed)
  }
  const hull = geometry.getAttribute(SMOOTHED_NORMAL_ATTRIBUTE) as THREE.BufferAttribute | undefined
  if (hull) {
    ;(hull.array as Float32Array).set(smoothed.array as Float32Array)
    hull.needsUpdate = true
  }
}

// --- spec (de)serialization ---------------------------------------------------

/** Sparse-encode one layer; null when every delta quantizes to zero. */
export function serializeMeshDelta(target: SculptTarget): SculptDeltaLayerPayload | null {
  const { delta } = target.layer
  const vertexCount = delta.length / 3
  const indices: number[] = []
  const values: number[] = []
  for (let v = 0; v < vertexCount; v++) {
    const i = v * 3
    const qx = Math.round(delta[i] / SCULPT_QUANTUM)
    const qy = Math.round(delta[i + 1] / SCULPT_QUANTUM)
    const qz = Math.round(delta[i + 2] / SCULPT_QUANTUM)
    if (qx === 0 && qy === 0 && qz === 0) continue
    indices.push(v)
    values.push(qx, qy, qz)
  }
  if (indices.length === 0) return null
  return {
    assetId: target.assetId,
    meshName: target.meshName,
    meshVersion: target.meshVersion,
    vertexCount,
    indices,
    values,
  }
}

/**
 * Serialize every non-empty target layer into the spec payload shape.
 * Returns null when nothing is sculpted (the spec field stays absent).
 */
export function serializeSculptDelta(
  targets: readonly SculptTarget[],
  base: { baseMeshId: string; baseMeshVersion: number },
): SculptDeltaPayload | null {
  const layers: SculptDeltaLayerPayload[] = []
  for (const target of targets) {
    const layer = serializeMeshDelta(target)
    if (layer) layers.push(layer)
  }
  if (layers.length === 0) return null
  return { ...base, quantum: SCULPT_QUANTUM, layers }
}

export interface SyncResult {
  /** Payload layers whose (assetId, meshName) matched no live target —
   * e.g. a sculpted part that is no longer equipped. Kept in the spec so
   * re-equipping restores the sculpt; reported so callers can surface it. */
  skippedLayers: SculptDeltaLayerPayload[]
}

/**
 * Make the live targets match a saved payload (or pristine base for null):
 * every target's delta is overwritten (zeroed when absent from the payload),
 * positions re-applied, normals recomputed exactly.
 *
 * Guard (loud, never silent): a payload layer that matches a live target but
 * disagrees on meshVersion or vertexCount throws SculptDeltaMismatchError —
 * artists bumping an asset's version invalidate saved sculpts by design.
 */
export function syncTargetsToPayload(
  targets: readonly SculptTarget[],
  payload: SculptDeltaPayload | null,
): SyncResult {
  const byKey = new Map<string, SculptTarget>()
  for (const target of targets) byKey.set(`${target.assetId} ${target.meshName}`, target)

  const matched = new Set<SculptTarget>()
  const skippedLayers: SculptDeltaLayerPayload[] = []
  const quantum = payload?.quantum ?? SCULPT_QUANTUM

  for (const layerPayload of payload?.layers ?? []) {
    const target = byKey.get(`${layerPayload.assetId} ${layerPayload.meshName}`)
    if (!target) {
      skippedLayers.push(layerPayload)
      continue
    }
    const vertexCount = target.layer.delta.length / 3
    if (layerPayload.meshVersion !== target.meshVersion) {
      throw new SculptDeltaMismatchError(
        layerPayload.assetId,
        layerPayload.meshName,
        'meshVersion',
        layerPayload.meshVersion,
        target.meshVersion,
      )
    }
    if (layerPayload.vertexCount !== vertexCount) {
      throw new SculptDeltaMismatchError(
        layerPayload.assetId,
        layerPayload.meshName,
        'vertexCount',
        layerPayload.vertexCount,
        vertexCount,
      )
    }
    matched.add(target)
    const { delta } = target.layer
    delta.fill(0)
    const { indices, values } = layerPayload
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k] * 3
      delta[i] = values[k * 3] * quantum
      delta[i + 1] = values[k * 3 + 1] * quantum
      delta[i + 2] = values[k * 3 + 2] * quantum
    }
    applyDelta(target.layer)
    recomputeNormals(target.layer.geometry)
  }

  for (const target of targets) {
    if (matched.has(target)) continue
    if (isZeroDelta(target.layer)) continue // already pristine — skip the rewrite
    target.layer.delta.fill(0)
    applyDelta(target.layer)
    recomputeNormals(target.layer.geometry)
  }

  return { skippedLayers }
}

export function isZeroDelta(layer: MeshDeltaLayer): boolean {
  for (let i = 0; i < layer.delta.length; i++) {
    if (layer.delta[i] !== 0) return false
  }
  return true
}

// --- target discovery ----------------------------------------------------------

export interface SculptTargetSource {
  assetId: string
  /** The pristine loaded scene this asset's meshes came from. */
  scene: THREE.Object3D
  meshVersion: number
  weldSpace: string
  localToWorldScale: number
}

/**
 * Map the assembled character's live meshes back to their authored assets by
 * mesh name (names survive SkeletonUtils cloning; unique per asset by the
 * ASSET-CONTRACT). Face planes, outline hulls, and wardrobe meshes are never
 * listed as sources, so they are never sculpt targets.
 */
export function collectSculptTargets(
  assembledRoot: THREE.Object3D,
  sources: readonly SculptTargetSource[],
): SculptTarget[] {
  const byMeshName = new Map<string, SculptTargetSource>()
  for (const source of sources) {
    source.scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return
      if (byMeshName.has(object.name)) {
        console.warn(`collectSculptTargets: duplicate mesh name "${object.name}" across assets — last source wins`)
      }
      byMeshName.set(object.name, source)
    })
  }

  const targets: SculptTarget[] = []
  assembledRoot.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const source = byMeshName.get(mesh.name)
    if (!source) return
    targets.push({
      assetId: source.assetId,
      meshName: mesh.name,
      meshVersion: source.meshVersion,
      mesh,
      layer: getDeltaLayer(mesh.geometry),
      weldSpace: source.weldSpace,
      localToWorldScale: source.localToWorldScale,
    })
  })
  return targets
}
