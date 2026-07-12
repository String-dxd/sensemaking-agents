import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { buildIslandField, composeGeometry, updateGeometry } from '../terrain/buildIslandGeometry'
import { blurTiers, sampleTierField, terraceHeight, type IslandSpec, worldToCell } from '../terrain/terrainGrid'
import { createIslandGroundMaterial } from './materials/IslandGroundMaterial'

const UP = new THREE.Vector3(0, 1, 0)

interface IslandTerrainProps {
  spec: IslandSpec
  brushSize: number
  /** When true (hold-Space), pointer drags fall through to OrbitControls instead
   *  of painting, so the camera can be orbited/panned over the island. */
  cameraMode?: boolean
  /** When true (a model kind is armed), pointer moves report the hovered point
   *  for the ghost and a click drops an object — instead of painting terrain. */
  placeMode?: boolean
  onPlaceHover?: (x: number, z: number) => void
  onPlaceClick?: (x: number, z: number) => void
  onPaintStart?: () => void
  onPaint?: (x: number, z: number) => void
  onPaintEnd?: () => void
  /** A drag-free click on the terrain while in camera mode: the click-to-move
   *  command for the placed character (plan 026). Drags still orbit. */
  onCommandMove?: (x: number, z: number) => void
}

/** Load the two ground textures once, configured like the app's loader:
 *  SRGB color space (they are color maps), repeat wrap, linear mipmaps. */
function useGroundTextures() {
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    const load = (name: string) => {
      const tex = loader.load(`/textures/${name}.png`)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.magFilter = THREE.LinearFilter
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.generateMipmaps = true
      return tex
    }
    return { sand: load('sand-soft-ripples'), cliff: load('cliff-soft-strata') }
  }, [])
  useEffect(
    () => () => {
      textures.sand.dispose()
      textures.cliff.dispose()
    },
    [textures],
  )
  return textures
}

export function IslandTerrain({
  spec,
  brushSize,
  cameraMode,
  placeMode,
  onPlaceHover,
  onPlaceClick,
  onPaintStart,
  onPaint,
  onPaintEnd,
  onCommandMove,
}: IslandTerrainProps) {
  const textures = useGroundTextures()

  const field = useMemo(() => buildIslandField(spec.worldSize), [spec.worldSize])
  // Build the geometry once per field; per-edit spec changes refresh it in place.
  const geometry = useMemo(() => composeGeometry(field, spec), [field])
  useEffect(() => {
    updateGeometry(geometry, field, spec)
  }, [geometry, field, spec])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () => createIslandGroundMaterial(textures, { seaLevel: spec.seaLevel }),
    [textures, spec.seaLevel],
  )
  useEffect(() => () => material.dispose(), [material])

  // Blurred tier field for cursor height sampling (cheap, cached per edit).
  const blurred = useMemo(() => blurTiers(spec.grid), [spec])

  const painting = useRef(false)
  const cursorRef = useRef<THREE.Mesh>(null)
  // Camera-mode click-vs-drag gesture (plan 026): remember where the pointer
  // went down; a pointer-up within 6 px of screen travel is a CLICK (the
  // click-to-move command), anything farther was an orbit drag.
  const camDown = useRef<{ sx: number; sy: number } | null>(null)
  // Stroke-locked horizontal picking plane. Painting against the live mesh is a
  // feedback loop: raising a cell grows the geometry under the cursor, the next
  // pointermove raycast hits the new taller column's slope, and its x/z maps to
  // a NEIGHBORING cell — a single click with 1px of jitter smears onto cells
  // around it. Locking the pick plane at the first hit's height makes the rest
  // of the stroke immune to its own edits.
  const strokePlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const strokeHit = useRef(new THREE.Vector3())

  // End the stroke even if the pointer releases off the terrain.
  useEffect(() => {
    const up = () => {
      if (!painting.current) return
      painting.current = false
      onPaintEnd?.()
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [onPaintEnd])

  // Snap the cursor quad to the brush-sized cell block under the pointer.
  const moveCursor = (x: number, z: number) => {
    const cursor = cursorRef.current
    if (!cursor) return
    const grid = spec.grid
    const cellSize = spec.worldSize / grid.cols
    const { c, r } = worldToCell(spec.worldSize, grid, x, z)
    if (c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) {
      cursor.visible = false
      return
    }
    const lo = -Math.floor((brushSize - 1) / 2)
    const cx = -spec.worldSize / 2 + (c + lo + brushSize / 2) * cellSize
    const cz = -spec.worldSize / 2 + (r + lo + brushSize / 2) * cellSize
    const t = sampleTierField(grid, blurred, spec.worldSize, cx, cz)
    const y = terraceHeight(t, spec.tierHeights) + 0.03
    cursor.position.set(cx, y, cz)
    cursor.scale.setScalar(brushSize * cellSize)
    cursor.visible = true
  }

  // Precedence in both handlers: camera (hold-Space) wins → then place mode →
  // then paint. So hold-Space always orbits, even while a model is armed.
  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    // Camera mode: let the drag reach OrbitControls instead of painting or
    // placing (no stopPropagation) — but remember the down point so a
    // drag-free release can become a click-to-move command (handleUp).
    if (cameraMode) {
      camDown.current = { sx: e.nativeEvent.clientX, sy: e.nativeEvent.clientY }
      return
    }
    if (placeMode) {
      e.stopPropagation()
      onPlaceClick?.(e.point.x, e.point.z)
      return
    }
    e.stopPropagation()
    painting.current = true
    // A hit on a cliff SIDE face is ambiguous between the tall column that owns
    // the face and the low cell in front of it. Resolve OUTWARD (along the face
    // normal) to the cell in front: growing a column requires clicking its TOP.
    // The inward reading turns near-misses into runaway spikes — aim at the low
    // block beside a slope, graze the slope instead, and the tall column gets
    // +1 tier per click. (Floor hits have an up normal, so x/z is unchanged.)
    const p = e.point.clone()
    if (e.face) p.addScaledVector(e.face.normal, 0.25 * (spec.worldSize / spec.grid.cols))
    strokePlane.current.set(UP, -e.point.y)
    onPaintStart?.()
    onPaint?.(p.x, p.z)
  }
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (cameraMode) {
      if (cursorRef.current) cursorRef.current.visible = false
      return
    }
    if (placeMode) {
      // The ghost (App-owned) tracks the hovered cell; hide the paint brush quad.
      if (cursorRef.current) cursorRef.current.visible = false
      onPlaceHover?.(e.point.x, e.point.z)
      return
    }
    moveCursor(e.point.x, e.point.z)
    if (!painting.current) return
    // Mid-stroke picks go against the stroke-locked plane, not the mesh — see
    // the strokePlane comment above.
    if (e.ray.intersectPlane(strokePlane.current, strokeHit.current)) {
      onPaint?.(strokeHit.current.x, strokeHit.current.z)
    }
  }
  const handleUp = (e: ThreeEvent<PointerEvent>) => {
    const down = camDown.current
    camDown.current = null // always cleared; non-camera modes do nothing else
    if (!cameraMode || !down) return
    if (Math.hypot(e.nativeEvent.clientX - down.sx, e.nativeEvent.clientY - down.sy) < 6) {
      onCommandMove?.(e.point.x, e.point.z)
    }
  }
  const handleOut = () => {
    if (cursorRef.current) cursorRef.current.visible = false
  }

  return (
    <>
      <mesh
        geometry={geometry}
        material={material}
        castShadow
        receiveShadow
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerOut={handleOut}
      />
      <mesh ref={cursorRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.4} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
    </>
  )
}
