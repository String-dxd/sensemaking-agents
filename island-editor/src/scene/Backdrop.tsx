import { Grid, Sky } from '@react-three/drei'

export function Backdrop() {
  return (
    <>
      <color attach="background" args={['#bcd7ff']} />
      <Sky sunPosition={[20, 12, 8]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[18, 20, 10]} intensity={1.15} castShadow />
      <Grid
        args={[60, 60]}
        position={[0, -0.01, 0]}
        cellSize={1}
        cellColor="#43506e"
        sectionSize={5}
        sectionColor="#5b6f99"
        fadeDistance={80}
        infiniteGrid
      />
    </>
  )
}
