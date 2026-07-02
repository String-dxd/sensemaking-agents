import { OrbitControls, Stats } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { runFrame } from '../../core/motion/frameLoop'
import { PlaceholderBody } from './PlaceholderBody'

// Drives the plan-000 §2.2 ordered update registry (src/core/motion/frameLoop)
// from r3f's render loop. Subsystems (procedural motion, spring-bone physics,
// ...) register against `animation` / `physics` / `procedural` / `render`
// phases and this is the single place that ticks them each frame.
function FrameLoopDriver() {
  useFrame((_, dt) => {
    runFrame(dt)
  })
  return null
}

// Minimal lit turntable stage: pedestal + camera + orbit controls. No HDRI
// yet (see src/assets/hdri/README.md — plan 010 owns real lighting), so the
// lighting rig here is a hemisphere + key directional light fallback.
function Lighting() {
  return (
    <>
      <hemisphereLight intensity={0.6} groundColor="#3a3a3e" color="#ffffff" />
      <directionalLight
        position={[2, 4, 3]}
        intensity={2.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
    </>
  )
}

function Pedestal() {
  return (
    <mesh position={[0, 0, 0]} receiveShadow>
      <cylinderGeometry args={[3, 3, 0.1, 64]} />
      <meshStandardMaterial color="#e8e8ec" roughness={0.9} />
    </mesh>
  )
}

export function Stage({ showStats = false }: { showStats?: boolean }) {
  return (
    <Canvas shadows="soft" camera={{ fov: 35, position: [0, 1.2, 3.2] }}>
      <color attach="background" args={['#1a1a1e']} />
      <FrameLoopDriver />
      <Lighting />
      <Pedestal />
      <PlaceholderBody />
      <OrbitControls target={[0, 0.7, 0]} />
      {showStats ? <Stats /> : null}
    </Canvas>
  )
}
