// LatticeTool (plan 009, step 5) — in-canvas FFD cage: control-point
// spheres (click to select), wireframe cage lines, and a drei PivotControls
// translate gizmo on the selected point. Drags preview live into the sculpt
// delta layer (latticeStore.dragCp); "Apply Lattice" in the SculptPanel
// bakes the session as one undoable command.

import { PivotControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { latticePointIndex } from '../../core/sculpt'
import { type LatticeSession, useLatticeStore } from '../state/latticeStore'
import { finalizeSculptVisuals, useSculptStore } from '../state/sculptStore'

export function LatticeTool() {
  const session = useLatticeStore((s) => s.session)
  if (!session) return null
  return <LatticeCage session={session} />
}

function cageSegments(session: LatticeSession): Float32Array {
  const { lattice } = session
  const [l, m, n] = lattice.resolution
  const points = lattice.points
  const out: number[] = []
  const push = (a: number, b: number) => {
    out.push(points[a * 3], points[a * 3 + 1], points[a * 3 + 2], points[b * 3], points[b * 3 + 1], points[b * 3 + 2])
  }
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < l; i++) {
        const a = latticePointIndex(lattice, i, j, k)
        if (i + 1 < l) push(a, latticePointIndex(lattice, i + 1, j, k))
        if (j + 1 < m) push(a, latticePointIndex(lattice, i, j + 1, k))
        if (k + 1 < n) push(a, latticePointIndex(lattice, i, j, k + 1))
      }
    }
  }
  return new Float32Array(out)
}

type OrbitLike = { enabled: boolean } | null

function LatticeCage({ session }: { session: LatticeSession }) {
  const version = useLatticeStore((s) => s.version)
  const selectedCp = useLatticeStore((s) => s.selectedCp)
  const selectCp = useLatticeStore((s) => s.selectCp)
  const dragCp = useLatticeStore((s) => s.dragCp)
  const controls = useThree((s) => s.controls) as unknown as OrbitLike

  const cpCount = session.lattice.points.length / 3

  // Cage line geometry, rebuilt on every control-point change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(cageSegments(session), 3))
    return geometry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, version])

  // Gizmo anchor for the selected control point. PivotControls with
  // autoTransform off: we own the matrix; onDrag hands us the new one.
  const gizmoMatrix = useMemo(() => {
    const m = new THREE.Matrix4()
    if (selectedCp >= 0) {
      m.makeTranslation(
        session.lattice.points[selectedCp * 3],
        session.lattice.points[selectedCp * 3 + 1],
        session.lattice.points[selectedCp * 3 + 2],
      )
    }
    return m
    // The gizmo matrix must NOT follow version bumps mid-drag (PivotControls
    // owns the visual transform during the gesture) — only selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCp, session])

  const dragPos = useRef(new THREE.Vector3())

  return (
    <group>
      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial color="#59c2ff" transparent opacity={0.55} depthTest={false} />
      </lineSegments>

      {Array.from({ length: cpCount }, (_, i) => (
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: control points are positional by definition
          key={i}
          position={[
            session.lattice.points[i * 3],
            session.lattice.points[i * 3 + 1],
            session.lattice.points[i * 3 + 2],
          ]}
          renderOrder={998}
          onClick={(e) => {
            e.stopPropagation()
            selectCp(i)
          }}
        >
          <sphereGeometry args={[0.014, 12, 8]} />
          <meshBasicMaterial color={i === selectedCp ? '#ffd23d' : '#59c2ff'} depthTest={false} />
        </mesh>
      ))}

      {selectedCp >= 0 ? (
        <PivotControls
          key={`${selectedCp}-${session.lattice.points.length}`}
          matrix={gizmoMatrix}
          autoTransform={false}
          disableRotations
          disableScaling
          disableSliders
          scale={0.14}
          lineWidth={2.5}
          depthTest={false}
          annotations={false}
          onDragStart={() => {
            if (controls) controls.enabled = false
          }}
          onDrag={(local) => {
            dragPos.current.setFromMatrixPosition(local)
            gizmoMatrix.copy(local)
            dragCp(selectedCp, dragPos.current.x, dragPos.current.y, dragPos.current.z)
          }}
          onDragEnd={() => {
            if (controls) controls.enabled = true
            const sculpt = useSculptStore.getState().session
            if (sculpt) finalizeSculptVisuals(sculpt) // exact normals + outline refresh
          }}
        />
      ) : null}
    </group>
  )
}
