// Renders `CharacterSpec.studioLook` into the viewport (plan 010, step 2/3):
// N directionalLights (shadow config per-light), a hemisphereLight for
// `ambientFloor`, drei's `Environment` for the HDRI (background + a small
// IBL contribution), and — when the studio (not Play Mode) wants them —
// draggable billboard gizmos per light. Replaces the plan-001 hardcoded
// `Lighting()` in `Stage.tsx`.
//
// Toon-material note: `createToonMaterial`'s `RE_IndirectDiffuse_Toon` only
// reads the shader's accumulated `irradiance` (ambient + hemisphere + light
// probes — see `../../core/materials/toonMaterial.ts`), so `ambientFloor`
// (the hemisphereLight below) is what actually lights the character's
// shadow side; the HDRI's job here is mood/backdrop + IBL for any
// non-toon-shaded surfaces (pedestal, wardrobe). This mirrors plan-005's own
// documented ambient path — nothing new is asked of the toon shader here.

import { Environment, Line, PivotControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getHdri } from '../../assets/hdri/registry'
import type { StudioLight, StudioLook, Vec3 } from '../../core/spec/lighting'
import type { CharacterSpec } from '../../core/spec/schema'
import { useCharacterStore } from '../state/characterStore'

// --- backdrop ----------------------------------------------------------------

// Fixed vertical gradient for the default 'gradient' background mode — a
// single cached CanvasTexture (never recreated), same "module-scoped
// singleton" convention as `toonMaterial.ts`'s `debugMask`.
let cachedGradientTexture: THREE.CanvasTexture | null = null
function getStudioGradientTexture(): THREE.CanvasTexture {
  if (cachedGradientTexture) return cachedGradientTexture
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('LightRig: 2D canvas context unavailable for the studio gradient backdrop')
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, '#2b2b33')
  gradient.addColorStop(0.55, '#1c1c22')
  gradient.addColorStop(1, '#111114')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  cachedGradientTexture = texture
  return texture
}

/**
 * Sets `scene.background` directly (mirrors drei `Environment`'s own
 * save-old/restore-old pattern in `setEnvProps`) for the 'gradient' and
 * 'solid' modes. The 'hdri' mode is handled by `<Environment background />`
 * instead — see `HdriEnvironment` below.
 */
function Backdrop({ mode, color }: { mode: 'gradient' | 'solid'; color: string }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const previous = scene.background
    scene.background = mode === 'gradient' ? getStudioGradientTexture() : new THREE.Color(color)
    return () => {
      scene.background = previous
    }
  }, [scene, mode, color])
  return null
}

// --- HDRI IBL + optional background -------------------------------------------

function HdriEnvironment({ environment }: { environment: StudioLook['environment'] }) {
  const hdri = getHdri(environment.hdriId) ?? getHdri('studio_small_08')
  const rotationRad = (environment.rotationDeg * Math.PI) / 180
  if (!hdri) return null
  return (
    <Environment
      files={hdri.url}
      background={environment.background === 'hdri'}
      environmentIntensity={environment.intensity}
      environmentRotation={[0, rotationRad, 0]}
      backgroundIntensity={environment.intensity}
      backgroundRotation={[0, rotationRad, 0]}
    />
  )
}

// --- directional lights --------------------------------------------------------

/** softness 0 (sharp, 2048) .. 1 (soft, 512) — see the step-3 gate note in the plan-010 report. */
function shadowMapSizeFor(shadowSoftness: number): number {
  return Math.round(THREE.MathUtils.lerp(2048, 512, THREE.MathUtils.clamp(shadowSoftness, 0, 1)))
}

function DirectionalLightRig({ light }: { light: StudioLight }) {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)

  useEffect(() => {
    if (lightRef.current && targetRef.current) lightRef.current.target = targetRef.current
  }, [])

  const mapSize = light.castShadow ? shadowMapSizeFor(light.shadowSoftness) : undefined

  return (
    <>
      <directionalLight
        ref={lightRef}
        color={light.color}
        intensity={light.intensity}
        position={light.position}
        castShadow={light.castShadow}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-radius={light.shadowSoftness * 6}
        // Same wrap-lighting-safe bias pair as the plan-001 rig this replaces
        // (Stage.tsx's retired `Lighting()`) — prevents grazing-angle acne.
        shadow-normalBias={0.06}
        shadow-bias={-0.0002}
      />
      {/* Target lives in the scene graph (sibling of the light, not a child of
          it) so its matrixWorld updates every frame — an untracked
          DirectionalLight.target is a well-known three.js gotcha. */}
      <object3D ref={targetRef} position={[0, light.targetHeight, 0]} />
    </>
  )
}

// --- top-level rig ---------------------------------------------------------------

export function LightRig({ studioLook }: { studioLook: StudioLook }) {
  return (
    <>
      <hemisphereLight intensity={studioLook.ambientFloor} groundColor="#7a6f8a" color="#fff4e6" />
      {studioLook.lights.map((light) => (
        <DirectionalLightRig key={light.id} light={light} />
      ))}
      <HdriEnvironment environment={studioLook.environment} />
      {studioLook.environment.background === 'gradient' ? <Backdrop mode="gradient" color="#1a1a1e" /> : null}
      {studioLook.environment.background === 'solid' ? (
        <Backdrop mode="solid" color={studioLook.environment.backgroundColor ?? '#1a1a1e'} />
      ) : null}
    </>
  )
}

// --- gizmos (plan 010, step 3) ---------------------------------------------------
//
// PivotControls is fully CONTROLLED (`matrix` prop + `autoTransform={false}`):
// the store is the single source of truth for `light.position`, so a preset
// switch or a panel-typed position also moves the gizmo, not just drags.
// `onDrag`'s world matrix `w` is read synchronously (its Matrix4 instances
// are shared/mutated by drei internally — never retained past the callback)
// and written back through the store, one patch per animation frame (same
// coalescing pattern as MaterialPanel/AnatomyPanel's `useRafPatch`).
//
// TODO(plan-009): route gizmo-drag position writes through the command stack
// once it exists (`src/core/commands/`); today this is a plain store patch.

type SpecUpdater = (draft: CharacterSpec) => void

function useLightingRafPatch(): (updater: SpecUpdater) => void {
  const patch = useCharacterStore((s) => s.patch)
  const queue = useRef<SpecUpdater[]>([])
  const scheduled = useRef(false)
  return useCallback(
    (updater: SpecUpdater) => {
      queue.current.push(updater)
      if (scheduled.current) return
      scheduled.current = true
      requestAnimationFrame(() => {
        scheduled.current = false
        const updaters = queue.current
        queue.current = []
        if (updaters.length === 0) return
        patch((draft) => {
          for (const u of updaters) u(draft)
        })
      })
    },
    [patch],
  )
}

const scratchVec3 = new THREE.Vector3()

function LightGizmo({ light, onDragPosition }: {
  light: StudioLight
  onDragPosition(id: string, position: Vec3): void
}) {
  const matrix = useMemo(() => new THREE.Matrix4().makeTranslation(...light.position), [light.position])
  const targetLocal: Vec3 = [-light.position[0], light.targetHeight - light.position[1], -light.position[2]]

  return (
    <PivotControls
      matrix={matrix}
      autoTransform={false}
      disableRotations
      disableScaling
      scale={0.55}
      lineWidth={2}
      depthTest={false}
      onDrag={(_l: THREE.Matrix4, _dl: THREE.Matrix4, w: THREE.Matrix4) => {
        scratchVec3.setFromMatrixPosition(w)
        onDragPosition(light.id, [scratchVec3.x, scratchVec3.y, scratchVec3.z])
      }}
    >
      <mesh>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color={light.color} toneMapped={false} />
      </mesh>
      <Line points={[[0, 0, 0], targetLocal]} color={light.color} lineWidth={1.5} transparent opacity={0.6} />
    </PivotControls>
  )
}

export function LightGizmos({ studioLook }: { studioLook: StudioLook }) {
  const rafPatch = useLightingRafPatch()

  const onDragPosition = useCallback(
    (id: string, position: Vec3) => {
      rafPatch((draft) => {
        if (!draft.studioLook) return
        draft.studioLook = {
          ...draft.studioLook,
          lights: draft.studioLook.lights.map((l) => (l.id === id ? { ...l, position } : l)),
        }
      })
    },
    [rafPatch],
  )

  return (
    <>
      {studioLook.lights.map((light) => (
        <LightGizmo key={light.id} light={light} onDragPosition={onDragPosition} />
      ))}
    </>
  )
}
