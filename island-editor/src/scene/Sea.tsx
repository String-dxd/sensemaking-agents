export function Sea({ level = 0, size = 400 }: { level?: number; size?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, level, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#2a6f97" transparent opacity={0.82} roughness={0.4} />
    </mesh>
  )
}
