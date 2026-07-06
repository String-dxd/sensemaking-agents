import { OrbitControls, Stats } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { type ComponentRef, Suspense, useEffect, useMemo } from 'react'
import { runFrame } from '../../core/motion/frameLoop'
import { studioLookFromPreset } from '../../core/spec/lighting'
import { PlayMode } from '../play/PlayMode'
import { usePlayStore } from '../play/playStore'
import { ThumbnailCaptureRig } from '../roster/thumbnails'
import { useCharacterStore } from '../state/characterStore'
import { useSculptStore } from '../state/sculptStore'
import { useLightingStudio } from '../state/studioStores'
import { CharacterRoot } from './CharacterRoot'
import { LatticeTool } from './LatticeTool'
import { LightGizmos, LightRig } from './LightRig'
import { PostFX } from './PostFX'
import { SculptTool } from './SculptTool'
import { StudioWalkDriver } from './StudioWalkDriver'

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
function Lighting({ gizmosAllowed }: { gizmosAllowed: boolean }) {
  const studioLook = useCharacterStore((s) => s.spec.studioLook)
  const showGizmos = useLightingStudio((s) => s.showGizmos)
  const playing = usePlayStore((s) => s.mode) === 'play'
  const look = studioLook ?? studioLookFromPreset('three-point-soft')
  return (
    <>
      <LightRig studioLook={look} />
      {!playing && gizmosAllowed && showGizmos ? <LightGizmos studioLook={look} /> : null}
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

export interface StageProps {
  showStats?: boolean
  /**
   * Owned by Shell.tsx (plan 012) — LightingPanel's portrait-camera bookmark
   * and the roster thumbnail rig both need this same OrbitControls instance,
   * and LightingPanel now renders in the shell's DOM column, outside this
   * component's tree, so the ref is created one level up and threaded down
   * to the in-Canvas `<OrbitControls>` here.
   */
  orbitControlsRef: React.RefObject<OrbitControlsHandle | null>
  /**
   * Light gizmos (position handles + light→target lines) are Lighting-mode
   * furniture — on every other tab they read as stray debug lines across the
   * viewport, so Shell only allows them when the Lighting tab is active.
   */
  lightGizmosAllowed?: boolean
}

/**
 * The 3D viewport ONLY — plan 012 pulled every DOM panel out of this
 * component (they now render in Shell.tsx's managed column via ModeTabs).
 * The Canvas itself must stay mounted at all times (unmounting loses the
 * WebGL context + in-memory character) regardless of which studio mode is
 * active; Shell never conditionally unmounts `<Stage>`.
 */
export function Stage({ showStats = false, orbitControlsRef, lightGizmosAllowed = true }: StageProps) {
  // `?fx=0` disables the whole post stack (perf A/B — plan 005 step 4).
  const fxEnabled = useMemo(() => new URLSearchParams(window.location.search).get('fx') !== '0', [])
  const playing = usePlayStore((s) => s.mode) === 'play'
  const cameraPreset = usePlayStore((s) => s.cameraPreset)

  // Play Mode force-exits sculpt mode (its motion drivers need the springs
  // and idle layer that sculpting pauses).
  useEffect(() => {
    if (playing) useSculptStore.getState().setActive(false)
  }, [playing])

  return (
    <Canvas shadows="soft" camera={{ fov: 35, position: [0, 1.2, 3.2] }}>
      <FrameLoopDriver />
      <Lighting gizmosAllowed={lightGizmosAllowed} />
      <Pedestal />
      {/* PlaceholderBody (plans 002–005) retired from the stage by plan
          006 — CharacterRoot mounts the real assembled character. */}
      <Suspense fallback={null}>
        <CharacterRoot />
      </Suspense>
      <Suspense fallback={null}>
        <PlayMode />
      </Suspense>
      <StudioWalkDriver />
      {playing ? null : (
        <>
          <SculptTool />
          <LatticeTool />
        </>
      )}
      {fxEnabled ? <PostFX /> : null}
      {/* follow/face presets drive the camera from PlayMode instead.
          makeDefault lets the sculpt/lattice tools rebind its buttons;
          the ref backs LightingPanel's portrait-camera bookmark AND the
          roster thumbnail rig's default framing. */}
      {!playing || cameraPreset === 'orbit' ? (
        <OrbitControls ref={orbitControlsRef} makeDefault target={[0, 0.7, 0]} />
      ) : null}
      {showStats ? <Stats /> : null}
      {/* Publishes gl/scene for on-demand roster thumbnail capture (plan
          012 step 2) — reuses THIS renderer via a temporary render target,
          never a second WebGL context. */}
      <ThumbnailCaptureRig />
    </Canvas>
  )
}
