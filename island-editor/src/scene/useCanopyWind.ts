import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { hashString } from '../models/rand'
import { CanopySpring } from './wind'

/**
 * Drive a model's named 'canopy' group with the spring-damper wind sim
 * (wind.ts). Tree kinds carry the group with a per-kind stiffness in
 * userData.windAmp (fruitTree 1, palm 0.7, pine 0.35); bush/rock resolve no
 * canopy → no-op. `key` seeds the per-tree flutter phase (object id / seed);
 * `worldX`/`worldZ` place the tree in the traveling gust front so downwind
 * neighbours catch the same gust a beat later. Frozen (crown at rest) under
 * prefers-reduced-motion. Render-layer only — the deterministic model builder
 * never sees time.
 */
export function useCanopyWind(model: THREE.Object3D, key: string, worldX: number, worldZ: number): void {
  const canopy = useMemo(() => model.getObjectByName('canopy'), [model])
  const spring = useMemo(() => new CanopySpring(((hashString(key) % 1000) / 1000) * Math.PI * 2), [key])
  const reduce = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame((state, dt) => {
    if (!canopy || reduce) return
    const amp = (canopy.userData.windAmp as number | undefined) ?? 1
    spring.step(state.clock.elapsedTime, dt, worldX, worldZ, amp)
    canopy.rotation.x = spring.rotX
    canopy.rotation.z = spring.rotZ
    canopy.scale.y = spring.scaleY
  })
}
