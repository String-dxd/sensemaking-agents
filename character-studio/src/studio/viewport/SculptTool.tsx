// SculptTool (plan 009, step 4) — in-canvas brush interaction. Left-drag
// sculpts, right-drag orbits (OrbitControls' LEFT action is unbound while
// the tool is mounted). Spring physics + idle motion are paused by
// CharacterRoot while sculpt mode is active, so the surface holds still;
// the face rig keeps blinking (it registers its own frame update).
//
// Space & math notes:
// - Picking is geodesic over the weld-space topology, in geometry-local
//   REST space (radius converted via the space's localToWorldScale).
// - inflate/smooth/pinch are intrinsic surface operations — evaluated
//   entirely in local space and added straight into the delta layer.
// - grab is a WORLD-space drag (screen drag projected onto the camera-facing
//   plane through the stroke's start hit). Each touched vertex maps the
//   world displacement into rest space through the inverse of its exact
//   per-vertex skinning transform (vertexWorldMatrix), so grabs stay
//   cursor-exact even under boneScales/morphs.
// - Mirror-X blends the primary and mirrored applications with
//   (d1 + d2) · max(w1,w2)/(w1+w2): far from the symmetry plane this is the
//   plain one-sided result; ON the plane the X components cancel instead of
//   doubling, so center strokes stay symmetric and continuous.
//
// Undo: every pointermove emits a coalescing SculptCommand (same strokeId)
// through the studio stack — one drag ends up as ONE history entry whose
// `before` holds each vertex's delta at its first touch of the stroke.

import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  applyDelta,
  type BrushKind,
  computeNeighborCentroids,
  createSculptCommand,
  currentGroupPositions,
  grabDisplacements,
  groupForVertex,
  inflateDisplacements,
  type MeshDeltaLayer,
  mirrorGroup,
  pickBrushGroups,
  pinchDisplacements,
  recomputeWeldedNormals,
  type SculptCommandEntry,
  type SculptTarget,
  type Seed,
  smoothDisplacements,
  vertexWorldMatrix,
  type WeldSpaceTopology,
} from '../../core/sculpt'
import { studioCommands } from '../state/commandStore'
import {
  commitSculptToSpec,
  finalizeSculptVisuals,
  type SculptSession,
  useSculptStore,
} from '../state/sculptStore'

// Per-move strength scales (fractions applied per pointermove event).
const INFLATE_STEP = 0.05 // × strength × radius, meters of normal push
const SMOOTH_STEP = 0.5 // × strength, Laplacian relax fraction
const PINCH_STEP = 0.08 // × strength, tangential pull fraction

interface UnionPick {
  groups: Uint32Array
  /** Primary-side falloff weights (0 where only the mirror touched). */
  w1: Float32Array
  /** Mirror-side weights (all 0 when mirror is off / no counterpart). */
  w2: Float32Array
  localHit: THREE.Vector3
  mirrorHit: THREE.Vector3
}

interface Stroke {
  id: string
  brush: BrushKind
  space: WeldSpaceTopology
  /** Grab keeps its start pick for the whole drag (SculptGL translate). */
  union: UnionPick | null
  startWorld: THREE.Vector3
  dragPlane: THREE.Plane
  /** Per layer: vertex → delta value at its FIRST touch of this stroke. */
  before: Map<MeshDeltaLayer, Map<number, [number, number, number]>>
  moveCount: number
  pickMs: number
  pickCount: number
}

const _m4 = new THREE.Matrix4()
const _inv = new THREE.Matrix4()
const _v3 = new THREE.Vector3()

type OrbitLike = {
  enabled: boolean
  mouseButtons: { LEFT?: number; MIDDLE?: number; RIGHT?: number }
} | null

export function SculptTool() {
  const active = useSculptStore((s) => s.active)
  const session = useSculptStore((s) => s.session)
  if (!active || !session) return null
  return <SculptToolImpl key={session.assembledRoot.uuid} session={session} />
}

function SculptToolImpl({ session }: { session: SculptSession }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as OrbitLike
  const ringRef = useRef<THREE.Group>(null)
  const mirrorRingRef = useRef<THREE.Group>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const strokeCounter = useRef(0)

  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  // Orbit: left button unbound (sculpt owns it), rotate moves to RIGHT.
  useEffect(() => {
    if (!controls) return
    const previous = { ...controls.mouseButtons }
    controls.mouseButtons.LEFT = undefined
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    return () => {
      controls.mouseButtons.LEFT = previous.LEFT
      controls.mouseButtons.MIDDLE = previous.MIDDLE
      controls.mouseButtons.RIGHT = previous.RIGHT
      controls.enabled = true
    }
  }, [controls])

  // Radius keys: [ shrinks, ] grows.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '[' && e.key !== ']') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const { radius, setRadius } = useSculptStore.getState()
      setRadius(e.key === '[' ? radius / 1.15 : radius * 1.15)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const canvas = gl.domElement

    const pointerNdc = (e: PointerEvent): THREE.Vector2 => {
      const rect = canvas.getBoundingClientRect()
      return new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
    }

    const raycastBrush = (e: PointerEvent) => {
      raycaster.setFromCamera(pointerNdc(e), camera)
      const meshes = session.targets.map((t) => t.mesh)
      const hits = raycaster.intersectObjects(meshes, false)
      for (const hit of hits) {
        if (!hit.face) continue
        const entry = session.byMesh.get(hit.object as THREE.Mesh)
        if (entry) return { hit, ...entry }
      }
      return null
    }

    /** Geodesic pick around a surface hit (+ mirrored pick when enabled). */
    const buildPick = (
      space: WeldSpaceTopology,
      target: SculptTarget,
      indexInSpace: number,
      face: { a: number; b: number; c: number },
      worldPoint: THREE.Vector3,
      stroke?: Stroke,
    ): UnionPick | null => {
      const t0 = performance.now()
      const { radius, mirrorX } = useSculptStore.getState()
      // World hit → local rest space through the seed vertex's exact skin map.
      vertexWorldMatrix(target.mesh, face.a, _m4)
      _inv.copy(_m4).invert()
      const localHit = worldPoint.clone().applyMatrix4(_inv)
      const mirrorHit = new THREE.Vector3(-localHit.x, localHit.y, localHit.z)
      const radiusLocal = radius / target.localToWorldScale

      const seeds: Seed[] = []
      for (const v of [face.a, face.b, face.c]) {
        const g = groupForVertex(space, indexInSpace, v)
        const { basePositions, delta } = target.layer
        const dx = basePositions[v * 3] + delta[v * 3] - localHit.x
        const dy = basePositions[v * 3 + 1] + delta[v * 3 + 1] - localHit.y
        const dz = basePositions[v * 3 + 2] + delta[v * 3 + 2] - localHit.z
        seeds.push({ group: g, dist: Math.sqrt(dx * dx + dy * dy + dz * dz) })
      }
      const primary = pickBrushGroups(space, seeds, radiusLocal)
      if (primary.groups.length === 0) return null

      let mirrored: { groups: Uint32Array; weights: Float32Array } | null = null
      if (mirrorX) {
        const mirrorSeeds: Seed[] = []
        for (const seed of seeds) {
          const m = mirrorGroup(space, seed.group)
          if (m >= 0) mirrorSeeds.push({ group: m, dist: seed.dist })
        }
        if (mirrorSeeds.length > 0) mirrored = pickBrushGroups(space, mirrorSeeds, radiusLocal)
      }

      // Union with per-side weights.
      const w1ByGroup = new Map<number, number>()
      primary.groups.forEach((g, i) => w1ByGroup.set(g, primary.weights[i]))
      const w2ByGroup = new Map<number, number>()
      if (mirrored) {
        const m = mirrored
        m.groups.forEach((g, i) => w2ByGroup.set(g, m.weights[i]))
      }
      const all = new Set<number>([...w1ByGroup.keys(), ...w2ByGroup.keys()])
      const groups = Uint32Array.from(all)
      const w1 = new Float32Array(groups.length)
      const w2 = new Float32Array(groups.length)
      groups.forEach((g, i) => {
        w1[i] = w1ByGroup.get(g) ?? 0
        w2[i] = w2ByGroup.get(g) ?? 0
      })
      if (stroke) {
        stroke.pickMs += performance.now() - t0
        stroke.pickCount++
      }
      return { groups, w1, w2, localHit, mirrorHit }
    }

    /** (d1 + d2) · max(w1,w2)/(w1+w2) — see module header. */
    const combineSides = (d1: Float32Array, d2: Float32Array, w1: Float32Array, w2: Float32Array): Float32Array => {
      const out = new Float32Array(d1.length)
      for (let i = 0; i < w1.length; i++) {
        const sum = w1[i] + w2[i]
        if (sum === 0) continue
        const f = Math.max(w1[i], w2[i]) / sum
        out[i * 3] = (d1[i * 3] + d2[i * 3]) * f
        out[i * 3 + 1] = (d1[i * 3 + 1] + d2[i * 3 + 1]) * f
        out[i * 3 + 2] = (d1[i * 3 + 2] + d2[i * 3 + 2]) * f
      }
      return out
    }

    const captureBefore = (stroke: Stroke, layer: MeshDeltaLayer, v: number) => {
      let map = stroke.before.get(layer)
      if (!map) {
        map = new Map()
        stroke.before.set(layer, map)
      }
      if (!map.has(v)) {
        map.set(v, [layer.delta[v * 3], layer.delta[v * 3 + 1], layer.delta[v * 3 + 2]])
      }
    }

    /** Group normals in local space (representative member's render normal). */
    const groupLocalNormals = (space: WeldSpaceTopology, groups: Uint32Array): Float32Array => {
      const out = new Float32Array(groups.length * 3)
      for (let i = 0; i < groups.length; i++) {
        const globalVertex = space.memberItems[space.memberStart[groups[i]]]
        let t = space.offsets.length - 1
        while (space.offsets[t] > globalVertex) t--
        const v = globalVertex - space.offsets[t]
        const normal = space.targets[t].layer.geometry.getAttribute('normal')
        out[i * 3] = normal.getX(v)
        out[i * 3 + 1] = normal.getY(v)
        out[i * 3 + 2] = normal.getZ(v)
      }
      return out
    }

    /** Add local-space per-group displacements into the delta layers. */
    const distributeLocal = (stroke: Stroke, groups: Uint32Array, disp: Float32Array) => {
      const space = stroke.space
      const touchedLayers = new Set<MeshDeltaLayer>()
      for (let i = 0; i < groups.length; i++) {
        const dx = disp[i * 3]
        const dy = disp[i * 3 + 1]
        const dz = disp[i * 3 + 2]
        if (dx === 0 && dy === 0 && dz === 0) continue
        const g = groups[i]
        const end = space.memberStart[g + 1]
        for (let m = space.memberStart[g]; m < end; m++) {
          const globalVertex = space.memberItems[m]
          let t = space.offsets.length - 1
          while (space.offsets[t] > globalVertex) t--
          const v = globalVertex - space.offsets[t]
          const layer = space.targets[t].layer
          captureBefore(stroke, layer, v)
          layer.delta[v * 3] += dx
          layer.delta[v * 3 + 1] += dy
          layer.delta[v * 3 + 2] += dz
          touchedLayers.add(layer)
        }
      }
      for (const layer of touchedLayers) applyDelta(layer)
    }

    /** Grab: ABSOLUTE world drag from the stroke's start, mapped per vertex
     * through the inverse skinning transform. */
    const applyGrab = (stroke: Stroke, dragWorld: THREE.Vector3) => {
      const union = stroke.union
      if (!union) return
      const space = stroke.space
      const d1 = grabDisplacements(union.w1, [dragWorld.x, dragWorld.y, dragWorld.z])
      const d2 = grabDisplacements(union.w2, [-dragWorld.x, dragWorld.y, dragWorld.z])
      const combined = combineSides(d1, d2, union.w1, union.w2)
      const touchedLayers = new Set<MeshDeltaLayer>()
      for (let i = 0; i < union.groups.length; i++) {
        const g = union.groups[i]
        const wx = combined[i * 3]
        const wy = combined[i * 3 + 1]
        const wz = combined[i * 3 + 2]
        const end = space.memberStart[g + 1]
        for (let m = space.memberStart[g]; m < end; m++) {
          const globalVertex = space.memberItems[m]
          let t = space.offsets.length - 1
          while (space.offsets[t] > globalVertex) t--
          const v = globalVertex - space.offsets[t]
          const target = space.targets[t]
          const layer = target.layer
          captureBefore(stroke, layer, v)
          const before = stroke.before.get(layer)?.get(v) as [number, number, number]
          // world displacement → rest space via linear(A⁻¹)
          vertexWorldMatrix(target.mesh, v, _m4)
          _inv.copy(_m4).invert()
          const e = _inv.elements
          layer.delta[v * 3] = before[0] + e[0] * wx + e[4] * wy + e[8] * wz
          layer.delta[v * 3 + 1] = before[1] + e[1] * wx + e[5] * wy + e[9] * wz
          layer.delta[v * 3 + 2] = before[2] + e[2] * wx + e[6] * wy + e[10] * wz
          touchedLayers.add(layer)
        }
      }
      for (const layer of touchedLayers) applyDelta(layer)
    }

    /** inflate/smooth/pinch: per-move intrinsic step at the current pick. */
    const applyAirbrush = (stroke: Stroke, pick: UnionPick) => {
      const { strength, radius } = useSculptStore.getState()
      const space = stroke.space
      const { groups, w1, w2, localHit, mirrorHit } = pick
      const positions = currentGroupPositions(space, groups)
      let d1: Float32Array
      let d2: Float32Array
      if (stroke.brush === 'inflate') {
        const normals = groupLocalNormals(space, groups)
        const step = (strength * radius * INFLATE_STEP) / space.targets[0].localToWorldScale
        d1 = inflateDisplacements(w1, normals, step)
        d2 = inflateDisplacements(w2, normals, step)
      } else if (stroke.brush === 'smooth') {
        const centroids = computeNeighborCentroids(space, groups)
        d1 = smoothDisplacements(positions, centroids, w1, strength * SMOOTH_STEP)
        d2 = smoothDisplacements(positions, centroids, w2, strength * SMOOTH_STEP)
      } else {
        const normals = groupLocalNormals(space, groups)
        d1 = pinchDisplacements(positions, normals, w1, [localHit.x, localHit.y, localHit.z], strength * PINCH_STEP)
        d2 = pinchDisplacements(positions, normals, w2, [mirrorHit.x, mirrorHit.y, mirrorHit.z], strength * PINCH_STEP)
      }
      distributeLocal(stroke, groups, combineSides(d1, d2, w1, w2))
    }

    const buildEntries = (stroke: Stroke): SculptCommandEntry[] => {
      const entries: SculptCommandEntry[] = []
      for (const [layer, beforeMap] of stroke.before) {
        const indices = Uint32Array.from(beforeMap.keys())
        const before = new Float32Array(indices.length * 3)
        const after = new Float32Array(indices.length * 3)
        indices.forEach((v, k) => {
          const b = beforeMap.get(v) as [number, number, number]
          before[k * 3] = b[0]
          before[k * 3 + 1] = b[1]
          before[k * 3 + 2] = b[2]
          after[k * 3] = layer.delta[v * 3]
          after[k * 3 + 1] = layer.delta[v * 3 + 1]
          after[k * 3 + 2] = layer.delta[v * 3 + 2]
        })
        entries.push({ layer, indices, before, after })
      }
      return entries
    }

    // Undo/redo re-application (outside live strokes): the command wrote the
    // deltas; recompute normals, refresh outlines, and re-sync the spec.
    const onApplied = () => {
      const live = useSculptStore.getState().session ?? session
      if (live.liveStroke) return
      finalizeSculptVisuals(live)
      commitSculptToSpec(live)
    }

    const emitStrokeCommand = (stroke: Stroke) => {
      const entries = buildEntries(stroke)
      if (entries.length === 0) return
      studioCommands.execute(
        createSculptCommand({
          strokeId: stroke.id,
          label: `sculpt: ${stroke.brush}`,
          entries,
          onApplied,
        }),
      )
    }

    const updateRings = (e: PointerEvent) => {
      const ring = ringRef.current
      const mirrorRing = mirrorRingRef.current
      if (!ring || !mirrorRing) return
      const found = raycastBrush(e)
      const { radius, mirrorX } = useSculptStore.getState()
      if (!found) {
        ring.visible = false
        mirrorRing.visible = false
        return
      }
      const worldNormal = _v3
        .copy(found.hit.face?.normal ?? new THREE.Vector3(0, 1, 0))
        .transformDirection(found.hit.object.matrixWorld)
      ring.visible = true
      ring.position.copy(found.hit.point).addScaledVector(worldNormal, 0.004)
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal)
      ring.scale.setScalar(radius)
      if (mirrorX) {
        mirrorRing.visible = true
        mirrorRing.position.set(-ring.position.x, ring.position.y, ring.position.z)
        const mirroredNormal = new THREE.Vector3(-worldNormal.x, worldNormal.y, worldNormal.z)
        mirrorRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), mirroredNormal)
        mirrorRing.scale.setScalar(radius)
      } else {
        mirrorRing.visible = false
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const found = raycastBrush(e)
      if (!found) return
      e.preventDefault()
      const { brush } = useSculptStore.getState()
      const stroke: Stroke = {
        id: `stroke-${++strokeCounter.current}`,
        brush,
        space: found.space,
        union: null,
        startWorld: found.hit.point.clone(),
        dragPlane: new THREE.Plane(),
        before: new Map(),
        moveCount: 0,
        pickMs: 0,
        pickCount: 0,
      }
      const pick = buildPick(found.space, found.target, found.indexInSpace, found.hit.face as THREE.Face, found.hit.point, stroke)
      if (!pick) return
      session.liveStroke = true
      strokeRef.current = stroke
      if (brush === 'grab') {
        stroke.union = pick
        camera.getWorldDirection(_v3)
        stroke.dragPlane.setFromNormalAndCoplanarPoint(_v3, stroke.startWorld)
      } else {
        // Airbrush brushes act on click too.
        stroke.moveCount = 1
        applyAirbrush(stroke, pick)
        recomputeWeldedNormals(stroke.space)
        emitStrokeCommand(stroke)
      }
      if (controls) controls.enabled = false
      canvas.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      const stroke = strokeRef.current
      if (!stroke) {
        updateRings(e)
        return
      }
      stroke.moveCount++
      if (stroke.brush === 'grab') {
        raycaster.setFromCamera(pointerNdc(e), camera)
        const point = new THREE.Vector3()
        if (!raycaster.ray.intersectPlane(stroke.dragPlane, point)) return
        applyGrab(stroke, point.sub(stroke.startWorld))
      } else {
        const found = raycastBrush(e)
        if (found && found.space === stroke.space) {
          const pick = buildPick(found.space, found.target, found.indexInSpace, found.hit.face as THREE.Face, found.hit.point, stroke)
          if (pick) applyAirbrush(stroke, pick)
        }
        updateRings(e)
      }
      // Normals: throttled to every other move during the drag, exact on release.
      if (stroke.moveCount % 2 === 0) recomputeWeldedNormals(stroke.space)
      emitStrokeCommand(stroke)
    }

    const endStroke = (e: PointerEvent) => {
      const stroke = strokeRef.current
      if (!stroke) return
      strokeRef.current = null
      session.liveStroke = false
      if (stroke.before.size > 0) {
        finalizeSculptVisuals(session)
        commitSculptToSpec(session)
      }
      if (import.meta.env.DEV && stroke.pickCount > 0) {
        console.info(
          `[sculpt] ${stroke.brush} stroke: ${stroke.moveCount} moves, pick avg ${(stroke.pickMs / stroke.pickCount).toFixed(2)} ms`,
        )
      }
      if (controls) controls.enabled = true
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }

    const onPointerLeave = () => {
      if (strokeRef.current) return
      if (ringRef.current) ringRef.current.visible = false
      if (mirrorRingRef.current) mirrorRingRef.current.visible = false
    }

    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__sculptDebug = {
        raycastAt(clientX: number, clientY: number) {
          const rect = canvas.getBoundingClientRect()
          const ndc = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
          )
          raycaster.setFromCamera(ndc, camera)
          const hits = raycaster.intersectObjects(
            session.targets.map((t) => t.mesh),
            false,
          )
          return hits.map((h) => ({ name: h.object.name, distance: h.distance, hasFace: !!h.face }))
        },
        project(x: number, y: number, z: number) {
          const rect = canvas.getBoundingClientRect()
          const p = new THREE.Vector3(x, y, z).project(camera)
          return { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height }
        },
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', endStroke)
    canvas.addEventListener('pointercancel', endStroke)
    canvas.addEventListener('pointerleave', onPointerLeave)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', endStroke)
      canvas.removeEventListener('pointercancel', endStroke)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      // A mid-stroke unmount (mode toggle) must not leave the session marked live.
      session.liveStroke = false
      strokeRef.current = null
      if (controls) controls.enabled = true
    }
  }, [session, camera, gl, controls, raycaster])

  return (
    <>
      <group ref={ringRef} visible={false}>
        <mesh renderOrder={999}>
          <ringGeometry args={[0.94, 1, 48]} />
          <meshBasicMaterial color="#ff8a3d" transparent opacity={0.95} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh renderOrder={999}>
          <circleGeometry args={[0.03, 12]} />
          <meshBasicMaterial color="#ff8a3d" transparent opacity={0.8} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group ref={mirrorRingRef} visible={false}>
        <mesh renderOrder={999}>
          <ringGeometry args={[0.94, 1, 48]} />
          <meshBasicMaterial color="#ff8a3d" transparent opacity={0.3} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </>
  )
}
