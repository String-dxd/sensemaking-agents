import { Sky } from '@react-three/drei'

// Flat studio stage: sky + fixed pleasant daylight. The old drei <Grid> helper
// was removed at the terraforming cutover — the sea plane now covers the stage
// and the transparent grid z-fought it (drawing over the water at distance).
export function Backdrop() {
  return (
    <>
      <color attach="background" args={['#bcd7ff']} />
      <Sky sunPosition={[20, 12, 8]} />
      <ambientLight intensity={0.6} />
      {/* Keep this position in sync with IslandGroundMaterial's uSunDirection
          default ([18, 20, 10] normalized) — the ground's lambert shading and
          the scene light must agree on where the sun is. */}
      <directionalLight position={[18, 20, 10]} intensity={1.15} />
    </>
  )
}
