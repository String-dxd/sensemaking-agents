import { Sky } from '@react-three/drei'

// Flat studio stage: sky + BOTW-style daylight rig. The old drei <Grid> helper
// was removed at the terraforming cutover — the sea plane now covers the stage
// and the transparent grid z-fought it (drawing over the water at distance).
//
// Light rig: a cool blue hemisphere fill (sky dome above, warm ground bounce
// below) plus a warm low-angle sun casting soft shadows — pale bright horizon,
// saturated blue zenith, airy overall exposure.
export function Backdrop() {
  return (
    <>
      <color attach="background" args={['#bcd7ff']} />
      <Sky
        sunPosition={[20, 12, 8]}
        turbidity={5}
        rayleigh={2.5}
        mieCoefficient={0.004}
        mieDirectionalG={0.75}
      />
      <hemisphereLight args={['#cfe5ff', '#c8bb94', 0.65]} />
      {/* Keep this position in sync with IslandGroundMaterial's uSunDirection
          default ([18, 20, 10] normalized) — the ground's lambert shading and
          the scene light must agree on where the sun is. */}
      <directionalLight
        position={[18, 20, 10]}
        color="#ffedcc"
        intensity={1.55}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
      />
    </>
  )
}
