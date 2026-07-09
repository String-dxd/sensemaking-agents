import { Suspense, useEffect } from 'react'
import { OrbitControls, Text } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { disposeObjectModel, useObjectModel } from '../models/useObjectModel'
import { OBJECT_KINDS, type ObjectKind } from '../terrain/terrainGrid'
import { useCanopyWind } from './useCanopyWind'

// Dev-only view (gated behind `?gallery` in main.tsx): lays out every ObjectKind
// across a row, with a few seeds per kind down the depth axis so the seeded
// variety is visible. Reuses the editor's daylight feel so the models read the
// same as they will in the scene. Not shipped in the editor proper.

const SEEDS = [1, 2, 3]
const SPACING_X = 1.6
const SPACING_Z = 1.6

function GalleryModel({
  kind,
  seed,
  position,
}: {
  kind: ObjectKind
  seed: number
  position: [number, number, number]
}) {
  const model = useObjectModel(kind, seed)
  useEffect(() => () => disposeObjectModel(model), [model])

  // Spring-damper wind on the crown (same hook as PlacedObjects): the gallery
  // position feeds the traveling gust front, so gusts visibly sweep the rows.
  useCanopyWind(model, `${kind}-${seed}`, position[0], position[2])

  return <primitive object={model} position={position} />
}

export function ModelGallery() {
  const offsetX = ((OBJECT_KINDS.length - 1) * SPACING_X) / 2
  const offsetZ = ((SEEDS.length - 1) * SPACING_Z) / 2

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas camera={{ position: [0, 3, 7], fov: 50 }}>
        <color attach="background" args={['#bcd7ff']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[18, 20, 10]} intensity={1.15} />

        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[24, 24]} />
          <meshStandardMaterial color="#7fae5a" />
        </mesh>

        <Suspense fallback={null}>
          {OBJECT_KINDS.map((kind, i) =>
            SEEDS.map((seed, j) => (
              <GalleryModel
                key={`${kind}-${seed}`}
                kind={kind}
                seed={seed}
                position={[i * SPACING_X - offsetX, 0, j * SPACING_Z - offsetZ]}
              />
            )),
          )}
        </Suspense>

        {OBJECT_KINDS.map((kind, i) => (
          <Text
            key={kind}
            position={[i * SPACING_X - offsetX, 1.9, -offsetZ - 1.0]}
            fontSize={0.18}
            color="#26331f"
            anchorX="center"
            anchorY="middle"
          >
            {kind}
          </Text>
        ))}

        <OrbitControls target={[0, 0.6, 0]} />
      </Canvas>
    </div>
  )
}
