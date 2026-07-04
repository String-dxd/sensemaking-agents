import { OrbitControls, Stats } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { type ComponentRef, Suspense, useEffect, useMemo, useRef } from 'react'
import { runFrame } from '../../core/motion/frameLoop'
import { studioLookFromPreset } from '../../core/spec/lighting'
import { AnatomyPanel } from '../panels/AnatomyPanel'
import { LightingPanel } from '../panels/LightingPanel'
import { MaterialPanel } from '../panels/MaterialPanel'
import { SculptPanel } from '../panels/SculptPanel'
import { WardrobePanel } from '../panels/WardrobePanel'
import { PlayControls } from '../play/PlayControls'
import { PlayMode } from '../play/PlayMode'
import { usePlayStore } from '../play/playStore'
import { useCharacterStore } from '../state/characterStore'
import { useSculptStore } from '../state/sculptStore'
import { useLightingStudio } from '../state/studioStores'
import { CharacterRoot } from './CharacterRoot'
import { LatticeTool } from './LatticeTool'
import { LightGizmos, LightRig } from './LightRig'
import { MotionDebugPanel } from './MotionDebugPanel'
import { PostFX } from './PostFX'
import { SculptTool } from './SculptTool'

export type OrbitControlsHandle = ComponentRef<typeof OrbitControls>

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

// `LightRig` renders `CharacterSpec.studioLook` (plan 010) — the plan-001
// hardcoded hemisphere + key-directional rig this replaced lived here.
// Specs saved before plan 010 (or a defensive fallback) may omit
// `studioLook`; fall back to the default preset rather than rendering an
// unlit scene.
function Lighting() {
  const studioLook = useCharacterStore((s) => s.spec.studioLook)
  const showGizmos = useLightingStudio((s) => s.showGizmos)
  const playing = usePlayStore((s) => s.mode) === 'play'
  const look = studioLook ?? studioLookFromPreset('three-point-soft')
  return (
    <>
      <LightRig studioLook={look} />
      {!playing && showGizmos ? <LightGizmos studioLook={look} /> : null}
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
  // LightingPanel's portrait-camera bookmark (plan 010 step 4) reads/writes
  // this instance directly (`.object` is the camera, `.target` the look-at
  // point) — cheaper than a Canvas-side bridge since both are DOM-side
  // imperative mutations picked up by the next frame of the always-running
  // render loop (FrameLoopDriver already ticks every frame).
  const orbitControlsRef = useRef<OrbitControlsHandle>(null)

  // Play Mode force-exits sculpt mode (its motion drivers need the springs
  // and idle layer that sculpting pauses).
  useEffect(() => {
    if (playing) useSculptStore.getState().setActive(false)
  }, [playing])

  return (
    <>
      <Canvas shadows="soft" camera={{ fov: 35, position: [0, 1.2, 3.2] }}>
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
        {playing ? null : (
          <>
            <SculptTool />
            <LatticeTool />
          </>
        )}
        {fxEnabled ? <PostFX /> : null}
        {/* follow/face presets drive the camera from PlayMode instead.
            makeDefault lets the sculpt/lattice tools rebind its buttons;
            the ref backs LightingPanel's portrait-camera bookmark. */}
        {!playing || cameraPreset === 'orbit' ? (
          <OrbitControls ref={orbitControlsRef} makeDefault target={[0, 0.7, 0]} />
        ) : null}
        {showStats ? <Stats /> : null}
      </Canvas>
      {/* Play Mode hides the editing panels (plan 007 step 5). */}
      {playing ? null : (
        <>
          <MotionDebugPanel />
          <MaterialPanel />
          <AnatomyPanel />
          <WardrobePanel />
          <LightingPanel orbitControlsRef={orbitControlsRef} />
          <SculptPanel />
        </>
      )}
      <PlayControls />
    </>
  )
}
