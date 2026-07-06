import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { buildIslandField, composeGeometry, updateGeometry } from '../terrain/buildIslandGeometry'
import { blurTiers, sampleTierField, terraceHeight, type IslandSpec, worldToCell } from '../terrain/terrainGrid'
import { createIslandGroundMaterial } from './materials/IslandGroundMaterial'

interface IslandTerrainProps {
  spec: IslandSpec
  brushSize: number
  /** When true (hold-Space), pointer drags fall through to OrbitControls instead
   *  of painting, so the camera can be orbited/panned over the island. */
  cameraMode?: boolean
  onPaintStart?: () => void
  onPaint?: (x: number, z: number) => void
  onPaintEnd?: () => void
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

export function IslandTerrain({ spec, brushSize, cameraMode, onPaintStart, onPaint, onPaintEnd }: IslandTerrainProps) {
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

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    // Hold-Space: let the drag reach OrbitControls instead of painting.
    if (cameraMode) return
    e.stopPropagation()
    painting.current = true
    onPaintStart?.()
    onPaint?.(e.point.x, e.point.z)
  }
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (cameraMode) {
      if (cursorRef.current) cursorRef.current.visible = false
      return
    }
    moveCursor(e.point.x, e.point.z)
    if (!painting.current) return
    onPaint?.(e.point.x, e.point.z)
  }
  const handleOut = () => {
    if (cursorRef.current) cursorRef.current.visible = false
  }

  return (
    <>
      <mesh
        geometry={geometry}
        material={material}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
      />
      <mesh ref={cursorRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.4} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
    </>
  )
}
