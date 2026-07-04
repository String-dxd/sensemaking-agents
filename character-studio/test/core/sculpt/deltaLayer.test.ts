import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { SMOOTHED_NORMAL_ATTRIBUTE } from '../../../src/core/materials/outline'
import {
  applyDelta,
  collectSculptTargets,
  getDeltaLayer,
  isZeroDelta,
  recomputeNormals,
  SCULPT_QUANTUM,
  SculptDeltaMismatchError,
  type SculptTarget,
  serializeMeshDelta,
  serializeSculptDelta,
  syncTargetsToPayload,
} from '../../../src/core/sculpt'
import { CharacterSpecSchema } from '../../../src/core/spec/schema'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'
import { parseSpec, serializeSpec } from '../../../src/core/spec/io'

function makeTarget(overrides: Partial<SculptTarget> = {}): SculptTarget {
  const geometry = new THREE.SphereGeometry(0.5, 8, 6)
  const mesh = new THREE.Mesh(geometry)
  return {
    assetId: 'body-biped-round',
    meshName: 'body',
    meshVersion: 1,
    mesh,
    layer: getDeltaLayer(geometry),
    weldSpace: 'body',
    localToWorldScale: 1,
    ...overrides,
  }
}

describe('delta layer', () => {
  it('applyDelta writes base + delta into position and leaves the base copy immutable', () => {
    const target = makeTarget()
    const { layer } = target
    const position = layer.geometry.getAttribute('position')
    const base0 = layer.basePositions[0]

    layer.delta[0] = 0.05
    layer.delta[1] = -0.02
    applyDelta(layer)
    expect(position.getX(0)).toBeCloseTo(base0 + 0.05, 6)
    expect(layer.basePositions[0]).toBe(base0) // base untouched

    layer.delta[0] = 0
    layer.delta[1] = 0
    applyDelta(layer)
    expect(position.getX(0)).toBeCloseTo(base0, 6)
    expect(isZeroDelta(layer)).toBe(true)
  })

  it('applyDelta leaves morph target attributes untouched (deltas compose in-shader, not by baking)', () => {
    const geometry = new THREE.SphereGeometry(0.5, 8, 6)
    const morph = new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3)
    morph.setXYZ(0, 0.1, 0.2, 0.3)
    geometry.morphAttributes.position = [morph]
    const layer = getDeltaLayer(geometry)
    layer.delta.fill(0.01)
    applyDelta(layer)
    expect(geometry.morphAttributes.position[0].getX(0)).toBeCloseTo(0.1, 6)
  })

  it('sparse serialization drops zero deltas and quantizes to SCULPT_QUANTUM', () => {
    const target = makeTarget()
    target.layer.delta[5 * 3] = 0.0123456 // vertex 5, x
    target.layer.delta[9 * 3 + 2] = -0.004 // vertex 9, z
    target.layer.delta[20 * 3 + 1] = SCULPT_QUANTUM * 0.4 // rounds to zero → dropped

    const payload = serializeMeshDelta(target)
    expect(payload).not.toBeNull()
    expect(payload?.indices).toEqual([5, 9])
    expect(payload?.values).toEqual([Math.round(0.0123456 / SCULPT_QUANTUM), 0, 0, 0, 0, Math.round(-0.004 / SCULPT_QUANTUM)])
    expect(payload?.vertexCount).toBe(target.layer.delta.length / 3)

    // Integer values (JSON-compact, exactly reproducible).
    for (const v of payload?.values ?? []) expect(Number.isInteger(v)).toBe(true)
  })

  it('serializeSculptDelta returns null when nothing is sculpted', () => {
    const target = makeTarget()
    expect(serializeSculptDelta([target], { baseMeshId: 'body-biped-round', baseMeshVersion: 1 })).toBeNull()
  })

  it('round-trips serialize → sync losslessly within half a quantum', () => {
    const source = makeTarget()
    // A deterministic pseudo-random-ish sculpt across many vertices.
    for (let v = 0; v < 40; v++) {
      source.layer.delta[v * 3] = Math.sin(v * 1.7) * 0.02
      source.layer.delta[v * 3 + 1] = Math.cos(v * 0.9) * 0.015
      source.layer.delta[v * 3 + 2] = ((v % 7) - 3) * 0.001
    }
    applyDelta(source.layer)
    const payload = serializeSculptDelta([source], { baseMeshId: 'body-biped-round', baseMeshVersion: 1 })
    expect(payload).not.toBeNull()

    const restored = makeTarget() // fresh geometry, same topology
    const result = syncTargetsToPayload([restored], payload)
    expect(result.skippedLayers).toEqual([])
    for (let i = 0; i < source.layer.delta.length; i++) {
      expect(Math.abs(restored.layer.delta[i] - source.layer.delta[i])).toBeLessThanOrEqual(SCULPT_QUANTUM / 2)
    }
    // Positions actually applied.
    const position = restored.layer.geometry.getAttribute('position')
    expect(position.getX(0)).toBeCloseTo(restored.layer.basePositions[0] + restored.layer.delta[0], 6)
  })

  it('the sculptDelta payload round-trips through the CharacterSpec save file', () => {
    const target = makeTarget()
    target.layer.delta[3] = 0.01
    const payload = serializeSculptDelta([target], { baseMeshId: 'body-biped-round', baseMeshVersion: 1 })
    const spec = createDefaultCharacter('biped-round')
    spec.anatomy.sculptDelta = payload ?? undefined
    expect(CharacterSpecSchema.safeParse(spec).success).toBe(true)

    const reloaded = parseSpec(serializeSpec(spec))
    expect(reloaded.anatomy.sculptDelta).toEqual(payload)
  })

  it('meshVersion mismatch throws the typed error (loud, never silent)', () => {
    const sculpted = makeTarget()
    sculpted.layer.delta[0] = 0.02
    const payload = serializeSculptDelta([sculpted], { baseMeshId: 'body-biped-round', baseMeshVersion: 1 })

    const newerAsset = makeTarget({ meshVersion: 2 })
    expect(() => syncTargetsToPayload([newerAsset], payload)).toThrowError(SculptDeltaMismatchError)
    try {
      syncTargetsToPayload([newerAsset], payload)
    } catch (error) {
      const e = error as SculptDeltaMismatchError
      expect(e.reason).toBe('meshVersion')
      expect(e.expected).toBe(1)
      expect(e.actual).toBe(2)
    }
  })

  it('vertexCount mismatch throws the typed error', () => {
    const sculpted = makeTarget()
    sculpted.layer.delta[0] = 0.02
    const payload = serializeSculptDelta([sculpted], { baseMeshId: 'body-biped-round', baseMeshVersion: 1 })

    const retopologized = new THREE.SphereGeometry(0.5, 12, 9) // different vertex count
    const target = makeTarget({ layer: getDeltaLayer(retopologized), mesh: new THREE.Mesh(retopologized) })
    expect(() => syncTargetsToPayload([target], payload)).toThrowError(SculptDeltaMismatchError)
  })

  it('sync resets targets absent from the payload and skips unknown layers', () => {
    const bodyTarget = makeTarget()
    bodyTarget.layer.delta[0] = 0.03
    applyDelta(bodyTarget.layer)

    const unknownLayer = {
      assetId: 'floppy-long',
      meshName: 'ears-floppy-long',
      meshVersion: 1,
      vertexCount: 210,
      indices: [0],
      values: [100, 0, 0],
    }
    const result = syncTargetsToPayload([bodyTarget], {
      baseMeshId: 'body-biped-round',
      baseMeshVersion: 1,
      quantum: SCULPT_QUANTUM,
      layers: [unknownLayer],
    })
    expect(result.skippedLayers).toEqual([unknownLayer]) // part not equipped — kept, reported
    expect(isZeroDelta(bodyTarget.layer)).toBe(true) // body reset to pristine
    const position = bodyTarget.layer.geometry.getAttribute('position')
    expect(position.getX(0)).toBeCloseTo(bodyTarget.layer.basePositions[0], 6)
  })

  it('recomputeNormals keeps seam-duplicate vertices identical and updates the outline attribute', () => {
    // SphereGeometry duplicates vertices along the UV seam — sculpting one
    // copy must never split the shading there.
    const geometry = new THREE.SphereGeometry(0.5, 8, 6)
    geometry.setAttribute(
      SMOOTHED_NORMAL_ATTRIBUTE,
      new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3),
    )
    const layer = getDeltaLayer(geometry)
    // Bulge a band of vertices.
    for (let v = 0; v < layer.delta.length / 3; v++) {
      if (layer.basePositions[v * 3 + 1] > 0.2) layer.delta[v * 3 + 1] = 0.1
    }
    applyDelta(layer)
    recomputeNormals(geometry)

    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const hull = geometry.getAttribute(SMOOTHED_NORMAL_ATTRIBUTE)
    const byPos = new Map<string, [number, number, number]>()
    for (let i = 0; i < position.count; i++) {
      const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`
      const n: [number, number, number] = [normal.getX(i), normal.getY(i), normal.getZ(i)]
      const seen = byPos.get(key)
      if (seen) {
        expect(n[0]).toBeCloseTo(seen[0], 6)
        expect(n[1]).toBeCloseTo(seen[1], 6)
        expect(n[2]).toBeCloseTo(seen[2], 6)
      } else {
        byPos.set(key, n)
      }
      // Outline hull attribute mirrors the render normal exactly.
      expect(hull.getX(i)).toBeCloseTo(n[0], 6)
      // Unit length.
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5)
    }
  })

  it('collectSculptTargets maps assembled clones back to their assets by mesh name', () => {
    const geometry = new THREE.BoxGeometry()
    const pristineBody = new THREE.Group()
    const bodyMesh = new THREE.Mesh(geometry)
    bodyMesh.name = 'body'
    pristineBody.add(bodyMesh)

    const earGeometry = new THREE.BoxGeometry()
    const pristineEars = new THREE.Group()
    const earMesh = new THREE.Mesh(earGeometry)
    earMesh.name = 'ears-upright-pointy'
    pristineEars.add(earMesh)

    // "Assembly": clones share geometry (assemble.ts memory contract).
    const root = new THREE.Group()
    const bodyClone = new THREE.Mesh(geometry)
    bodyClone.name = 'body'
    const earClone = new THREE.Mesh(earGeometry)
    earClone.name = 'ears-upright-pointy'
    const stranger = new THREE.Mesh(new THREE.BoxGeometry())
    stranger.name = 'toon-outline'
    root.add(bodyClone, earClone, stranger)

    const targets = collectSculptTargets(root, [
      { assetId: 'body-biped-round', scene: pristineBody, meshVersion: 1, weldSpace: 'body', localToWorldScale: 1 },
      { assetId: 'upright-pointy', scene: pristineEars, meshVersion: 1, weldSpace: 'upright-pointy', localToWorldScale: 0.93 },
    ])
    expect(targets.map((t) => `${t.assetId}/${t.meshName}`)).toEqual([
      'body-biped-round/body',
      'upright-pointy/ears-upright-pointy',
    ])
    // The layer wraps the SHARED geometry — sculpt survives reassembly.
    expect(targets[0].layer).toBe(getDeltaLayer(geometry))
  })
})
