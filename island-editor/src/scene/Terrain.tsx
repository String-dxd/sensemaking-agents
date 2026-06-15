import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { buildBaseField, composeGeometry, updateGeometry } from '../terrain/buildTerrainGeometry'
import type { IslandSpec } from '../terrain/islandSpec'

interface TerrainProps {
  spec: IslandSpec
  segments?: number
  sculptActive?: boolean
  onPaintStart?: () => void
  onPaint?: (x: number, z: number) => void
  onPaintEnd?: () => void
}

export function Terrain({
  spec,
  segments = 80,
  sculptActive = false,
  onPaintStart,
  onPaint,
  onPaintEnd,
}: TerrainProps) {
  // Expensive coastline/point-in-polygon work — only recomputed on shape edits.
  const field = useMemo(
    () => buildBaseField(spec, segments),
    [spec.coastline, spec.heightProfile, spec.worldSize, segments],
  )
  const geometry = useMemo(() => composeGeometry(field, spec), [field])

  // Refresh heights + colors in place (cheap) whenever the spec changes —
  // notably on brush strokes, which change only the relief.
  useEffect(() => {
    updateGeometry(geometry, field, spec)
  }, [geometry, field, spec])
  useEffect(() => () => geometry.dispose(), [geometry])

  const painting = useRef(false)

  // End the stroke even if the pointer releases off the terrain.
  useEffect(() => {
    if (!sculptActive) return
    const up = () => {
      if (!painting.current) return
      painting.current = false
      onPaintEnd?.()
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [sculptActive, onPaintEnd])

  const handleDown = sculptActive
    ? (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        painting.current = true
        onPaintStart?.()
        onPaint?.(e.point.x, e.point.z)
      }
    : undefined
  const handleMove = sculptActive
    ? (e: ThreeEvent<PointerEvent>) => {
        if (!painting.current) return
        onPaint?.(e.point.x, e.point.z)
      }
    : undefined

  return (
    <mesh geometry={geometry} castShadow receiveShadow onPointerDown={handleDown} onPointerMove={handleMove}>
      <meshStandardMaterial vertexColors roughness={0.95} />
    </mesh>
  )
}
