import { OrbitControls, Stats } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { runFrame } from '../../core/motion/frameLoop'
import { AnatomyPanel } from '../panels/AnatomyPanel'
import { MaterialPanel } from '../panels/MaterialPanel'
import { PlayControls } from '../play/PlayControls'
import { PlayMode } from '../play/PlayMode'
import { usePlayStore } from '../play/playStore'
import { CharacterRoot } from './CharacterRoot'
import { MotionDebugPanel } from './MotionDebugPanel'
import { PostFX } from './PostFX'

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
// The matte toon look (plan 000 §2.3 step 5) needs a HIGH ambient floor
// (~0.45) so shadow-mapped/unlit areas stay pastel instead of going dirty —
// warm sky, slightly violet ground bounce.
function Lighting() {
  return (
    <>
      <hemisphereLight intensity={0.9} groundColor="#7a6f8a" color="#fff4e6" />
      <directionalLight
        position={[2, 4, 3]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        // Wrap lighting keeps grazing surfaces lit where the shadow map
        // disagrees — without a normal bias that shows as dark acne speckle.
        shadow-normalBias={0.06}
        shadow-bias={-0.0002}
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
  // `?fx=0` disables the whole post stack (perf A/B — plan 005 step 4).
  const fxEnabled = useMemo(() => new URLSearchParams(window.location.search).get('fx') !== '0', [])
  const playing = usePlayStore((s) => s.mode) === 'play'
  const cameraPreset = usePlayStore((s) => s.cameraPreset)

  return (
    <>
      <Canvas shadows="soft" camera={{ fov: 35, position: [0, 1.2, 3.2] }}>
        <color attach="background" args={['#1a1a1e']} />
        <FrameLoopDriver />
        <Lighting />
        <Pedestal />
        {/* PlaceholderBody (plans 002–005) retired from the stage by plan
            006 — CharacterRoot mounts the real assembled character. */}
        <Suspense fallback={null}>
          <CharacterRoot />
        </Suspense>
        <Suspense fallback={null}>
          <PlayMode />
        </Suspense>
        {fxEnabled ? <PostFX /> : null}
        {/* follow/face presets drive the camera from PlayMode instead. */}
        {!playing || cameraPreset === 'orbit' ? <OrbitControls target={[0, 0.7, 0]} /> : null}
        {showStats ? <Stats /> : null}
      </Canvas>
      {/* Play Mode hides the editing panels (plan 007 step 5). */}
      {playing ? null : (
        <>
          <MotionDebugPanel />
          <MaterialPanel />
          <AnatomyPanel />
        </>
      )}
      <PlayControls />
    </>
  )
}
