import { ContactShadows } from '@react-three/drei'

// Neutral studio stage for judging silhouette + color (no CDN environment, to
// keep the studio self-contained). Key + fill + hemisphere, soft contact shadow.
export function Backdrop() {
  return (
    <>
      <color attach="background" args={['#c9c7cd']} />
      <hemisphereLight args={['#ffffff', '#9a9aa2', 0.6]} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 3, -3]} intensity={0.3} />
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={6} blur={2.2} far={3} color="#3a3a40" />
    </>
  )
}
