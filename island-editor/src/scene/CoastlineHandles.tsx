import { useEffect, useState } from 'react'
import { type ThreeEvent, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vec2 } from '../terrain/islandSpec'

interface HandlesProps {
  points: Vec2[]
  seaLevel: number
  onChange: (index: number, next: Vec2) => void
  onDragChange: (dragging: boolean) => void
}

export function CoastlineHandles({ points, seaLevel, onChange, onDragChange }: HandlesProps) {
  return (
    <>
      {points.map((pt, i) => (
        <Handle
          // biome-ignore lint/suspicious/noArrayIndexKey: control points are positional and stable by index
          key={i}
          index={i}
          point={pt}
          seaLevel={seaLevel}
          onChange={onChange}
          onDragChange={onDragChange}
        />
      ))}
    </>
  )
}

interface HandleProps {
  index: number
  point: Vec2
  seaLevel: number
  onChange: (index: number, next: Vec2) => void
  onDragChange: (dragging: boolean) => void
}

function Handle({ index, point, seaLevel, onChange, onDragChange }: HandleProps) {
  const { camera, gl } = useThree()
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const y = seaLevel + 0.3

  // While dragging, raycast the pointer onto a horizontal plane at handle
  // height and write the control point. Window-level listeners so the drag
  // survives the pointer leaving the small handle sphere.
  useEffect(() => {
    if (!dragging) return
    onDragChange(true)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()
    const move = (ev: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect()
      ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      if (raycaster.ray.intersectPlane(plane, hit)) onChange(index, { x: hit.x, z: hit.z })
    }
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onDragChange(false)
    }
  }, [dragging, camera, gl, index, onChange, onDragChange, y])

  const active = hovered || dragging
  return (
    <mesh
      position={[point.x, y, point.z]}
      scale={active ? 1.7 : 1}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        setDragging(true)
      }}
    >
      <sphereGeometry args={[0.11, 16, 12]} />
      <meshStandardMaterial
        color={dragging ? '#ffd166' : hovered ? '#ffe39a' : '#ff7b54'}
        emissive={active ? '#3a1a00' : '#000000'}
      />
    </mesh>
  )
}
