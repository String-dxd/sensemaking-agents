import { useMemo } from 'react'
import * as THREE from 'three'

// Minimal stand-in character: a capsule body + sphere head, toon-shaded with
// a 3-step gradient map generated in code. Plans 002/003/006 replace this
// with the real skeleton/skin — keep this a single, easily-swappable
// component so nothing else in the viewport needs to change when it goes.
export function PlaceholderBody() {
  const gradientMap = useMemo(() => {
    const data = new Uint8Array([64, 64, 64, 255, 160, 160, 160, 255, 255, 255, 255, 255])
    const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
    texture.needsUpdate = true
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    return texture
  }, [])

  return (
    <group position={[0, 0.55, 0]} castShadow>
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.3, 0.5, 4, 16]} />
        <meshToonMaterial color="#e8a15c" gradientMap={gradientMap} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.28, 24, 16]} />
        <meshToonMaterial color="#f0b06a" gradientMap={gradientMap} />
      </mesh>
    </group>
  )
}
