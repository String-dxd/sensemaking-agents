import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { shoreDistanceField } from '../terrain/shoreField'
import type { IslandSpec } from '../terrain/terrainGrid'
import { createSeaMaterial, createShoreDataTexture, updateShoreDataTexture } from './materials/SeaMaterial'

/** The sea plane, shaded by the grid-derived shore-distance field. The shore
 *  DataTexture is recomputed whenever the grid changes (spec identity ticks). */
export function SeaSurface({ spec }: { spec: IslandSpec }) {
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    // Foam masks are data, not color — loaded linear (like the app's loader).
    const load = (name: string) => {
      const tex = loader.load(`/textures/${name}.png`)
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.magFilter = THREE.LinearFilter
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.generateMipmaps = true
      return tex
    }
    return { foamCells: load('water-foam-cells'), shortBubbles: load('water-short-bubbles') }
  }, [])
  useEffect(
    () => () => {
      textures.foamCells.dispose()
      textures.shortBubbles.dispose()
    },
    [textures],
  )

  // Shore texture: created once (fixed lattice resolution), refreshed per edit.
  const shoreTex = useMemo(
    () => createShoreDataTexture(shoreDistanceField(spec.grid, spec.worldSize)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; updated in place below
    [],
  )
  useEffect(() => {
    updateShoreDataTexture(shoreTex, shoreDistanceField(spec.grid, spec.worldSize))
  }, [shoreTex, spec])
  useEffect(() => () => shoreTex.dispose(), [shoreTex])

  const material = useMemo(
    () => createSeaMaterial(textures, shoreTex, { worldSize: spec.worldSize }),
    [textures, shoreTex, spec.worldSize],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    // The app integrates its ocean clock at 0.45× real time when calm (rain
    // speeds it up); the ported shore layers were tuned at that pace, so match
    // it here — full speed makes the wash/ripples churn instead of lap.
    material.uniforms.uTime.value = state.clock.elapsedTime * 0.45
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, spec.seaLevel, 0]} material={material}>
      {/* Large enough that the shader's horizon fade (out to worldSize*7) fully
          completes before the plane's edge — so the rim dissolves into the sky
          rather than showing a hard square. */}
      <planeGeometry args={[spec.worldSize * 16, spec.worldSize * 16]} />
    </mesh>
  )
}
