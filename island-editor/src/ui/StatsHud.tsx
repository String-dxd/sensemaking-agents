import './panel.css'
import { useEffect, useState } from 'react'
import { frameStats } from '../scene/frameStats'

/** Compact count formatting: 1234 → "1.2k", 1234567 → "1.2M". */
function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

/** Top-left performance HUD (plan 029): reads the frameStats singleton the
 *  in-Canvas probe writes, on a 500 ms interval — never per frame. Always on
 *  (visibility IS the maintainer's feature request). */
export function StatsHud() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])
  const s = frameStats
  return (
    <div
      className="stats-hud"
      title={
        'fps: frames per second (0.5 s window)\n' +
        'ms: average frame time\n' +
        'calls: WebGL draw calls per frame\n' +
        'tris: triangles per frame\n' +
        'geo/tex: geometries and textures resident in GPU memory'
      }
    >
      {Math.round(s.fps)} fps · {s.ms.toFixed(1)} ms · {s.drawCalls} calls · {compact(s.triangles)} tris · geo{' '}
      {s.geometries} · tex {s.textures}
    </div>
  )
}
