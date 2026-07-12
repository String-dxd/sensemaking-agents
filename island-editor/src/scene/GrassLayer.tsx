import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BLADES_PER_CELL, grassBlades } from '../terrain/grassField'
import { blurTiers, type IslandSpec, worldPositionOfObject } from '../terrain/terrainGrid'
import { createGrassBladeMaterial } from './materials/GrassBladeMaterial'

/** Renders every grass-painted cell as ~BLADES_PER_CELL procedural blade cards
 *  in ONE instanced draw call (plan 020's BOTW meadow — replaces the one
 *  GLB-tuft-per-cell layer, whose 64×64 lattice of identical clumps read as
 *  crop rows). Blade positions come from the pure grassBlades helper
 *  (grassField.ts): jittered past cell borders so painted regions interlock,
 *  terrain-height-following, water-clipped at shore edges. Wind is entirely
 *  vertex-shader-side (GrassBladeMaterial) — per-instance JS springs don't
 *  scale to a hundred thousand blades. Frozen under prefers-reduced-motion,
 *  same contract as useCanopyWind. */

// One tapered blade card: 5 vertices / 3 triangles, base at y=0, unit height.
// uv.y = height fraction (0 base → 1 tip; the shader bends by uv.y);
// uv.x = 0..1 across the blade (the fragment's soft-edge feather reads it —
// plan 024). Shared module-level template — each mount's
// InstancedBufferGeometry copies it.
// Width retuned 0.045 → 0.018 per maintainer feedback (plan 021); mid
// vertices pulled in and up (±BLADE_W/4 at y=0.6, plan 024) so the blade
// reads as a sharp spike rather than a rounded leaf.
const BLADE_W = 0.018
function bladeCard(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  // prettier-ignore
  const positions = new Float32Array([
    -BLADE_W / 2, 0, 0,
    BLADE_W / 2, 0, 0,
    -BLADE_W / 4, 0.6, 0,
    BLADE_W / 4, 0.6, 0,
    0, 1, 0,
  ])
  const uvs = new Float32Array([0, 0, 1, 0, 0.25, 0.6, 0.75, 0.6, 0.5, 1])
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4])
  return geo
}
const CARD = bladeCard()

export function GrassLayer({ spec }: { spec: IslandSpec }) {
  // Capacity = full-grid worst case (every cell painted). The App.tsx mount
  // keys this component on grid dims, so a re-mount reallocates on resize.
  const capacity = spec.grid.cols * spec.grid.rows * BLADES_PER_CELL

  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.InstancedBufferGeometry()
    // copy() clones the card's index + position/uv; the narrower parameter
    // type on InstancedBufferGeometry.copy is safe to widen for a plain card.
    geometry.copy(CARD as THREE.InstancedBufferGeometry)
    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3))
    geometry.setAttribute('aYawScale', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
    geometry.setAttribute('aShadePhase', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
    geometry.instanceCount = 0
    return { geometry, material: createGrassBladeMaterial() }
  }, [capacity])

  // Own geometry/material (nothing shared with a loader cache) → dispose for
  // real on unmount / reallocation.
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  // Refill the instanced attributes on every spec edit (paint/erase/undo all
  // produce a new spec object — same trigger the old per-cell layer used).
  useEffect(() => {
    const blades = grassBlades(spec)
    const offset = geometry.getAttribute('aOffset') as THREE.InstancedBufferAttribute
    const yawScale = geometry.getAttribute('aYawScale') as THREE.InstancedBufferAttribute
    const shadePhase = geometry.getAttribute('aShadePhase') as THREE.InstancedBufferAttribute
    blades.forEach((b, i) => {
      offset.setXYZ(i, b.x, b.y, b.z)
      yawScale.setXY(i, b.yaw, b.height)
      shadePhase.setXY(i, b.shade, b.phase)
    })
    geometry.instanceCount = blades.length
    offset.needsUpdate = true
    yawScale.needsUpdate = true
    shadePhase.needsUpdate = true

    // Character reaction + fade disc (plan 024): the placed character is
    // static per spec, so the uniform updates here — no per-frame tracking.
    // One blurTiers per edit is the same cost PlacedObjects already pays.
    const char = spec.objects.find((o) => o.kind === 'character')
    const u = material.uniforms.uCharPos.value as THREE.Vector4
    if (char) {
      const { x, y, z } = worldPositionOfObject(spec, char, blurTiers(spec.grid))
      u.set(x, y, z, 1)
    } else {
      u.set(0, 0, 0, 0)
    }
  }, [spec, geometry, material])

  // Wind clock — frozen (uTime stays 0) under prefers-reduced-motion, same
  // matchMedia-once pattern as useCanopyWind.
  const reduce = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame((state) => {
    if (reduce) return
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh
      geometry={geometry}
      material={material}
      // Per-blade shadows are noise at this scale; the ground's painted
      // under-tint plays the grounding role instead.
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false} // instance bounds aren't tracked; the island is always in frame
      raycast={() => null} // never intercept paint/place picks
    />
  )
}
