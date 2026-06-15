import { useCallback, useMemo, useRef, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Backdrop } from './scene/Backdrop'
import { CoastlineHandles } from './scene/CoastlineHandles'
import { Sea } from './scene/Sea'
import { Terrain } from './scene/Terrain'
import { applyBrush, type BrushParams } from './terrain/brush'
import {
  type HeightProfile,
  type IslandSpec,
  type ReliefGrid,
  seedFromCurrentIsland,
  type Vec2,
} from './terrain/islandSpec'
import { type EditMode, ToolPanel } from './ui/ToolPanel'

const SEED = seedFromCurrentIsland()

export function App() {
  const [mode, setMode] = useState<EditMode>('shape')
  const [coastline, setCoastline] = useState<Vec2[]>(SEED.coastline)
  const [profile, setProfile] = useState<HeightProfile>(SEED.heightProfile)
  const [brush, setBrush] = useState<BrushParams>({ radius: 3, strength: 0.3, mode: 'raise' })
  const [orbitEnabled, setOrbitEnabled] = useState(true)

  // Relief lives in a ref (mutated in place by the brush, cheaply) with a tick
  // to trigger spec recompute — keeps brush dabs out of a React updater so
  // StrictMode's double-invoke can't double-apply a stroke.
  const reliefRef = useRef<ReliefGrid>(SEED.relief)
  const [reliefTick, setReliefTick] = useState(0)
  const brushRef = useRef(brush)
  brushRef.current = brush

  const spec: IslandSpec = useMemo(
    () => ({
      version: 1,
      worldSize: SEED.worldSize,
      coastline,
      heightProfile: profile,
      relief: { resolution: reliefRef.current.resolution, data: reliefRef.current.data },
    }),
    [coastline, profile, reliefTick],
  )

  const movePoint = useCallback((index: number, next: Vec2) => {
    setCoastline((pts) => pts.map((p, i) => (i === index ? next : p)))
  }, [])

  const paint = useCallback((x: number, z: number) => {
    applyBrush(reliefRef.current, SEED.worldSize, x, z, brushRef.current)
    setReliefTick((t) => t + 1)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas shadows camera={{ position: [14, 11, 14], fov: 50 }}>
        <Backdrop />
        <Sea level={profile.seaLevel} />
        <Terrain
          spec={spec}
          sculptActive={mode === 'sculpt'}
          onPaintStart={() => setOrbitEnabled(false)}
          onPaint={paint}
          onPaintEnd={() => setOrbitEnabled(true)}
        />
        {mode === 'shape' && (
          <CoastlineHandles
            points={coastline}
            seaLevel={profile.seaLevel}
            onChange={movePoint}
            onDragChange={(d) => setOrbitEnabled(!d)}
          />
        )}
        <OrbitControls makeDefault enabled={orbitEnabled} />
      </Canvas>
      <ToolPanel
        mode={mode}
        onModeChange={setMode}
        profile={profile}
        onProfileChange={setProfile}
        brush={brush}
        onBrushChange={setBrush}
      />
    </div>
  )
}
