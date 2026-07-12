// Renderer performance counters (plan 029). The probe lives INSIDE the r3f
// Canvas (useFrame needs the fiber context); the HUD div lives outside — they
// meet at this mutable module singleton, same pattern as characterPose.ts
// (per-frame data must never flow through React state).

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export const frameStats = {
  fps: 0,
  /** Average frame time over the last window, in milliseconds. */
  ms: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
}

/** How often the rolling window flushes into the singleton (seconds). */
const WINDOW_S = 0.5

/** In-Canvas probe: accumulates frames and, twice per second, writes fps/ms
 *  plus the renderer's draw-call/triangle/memory counters into `frameStats`.
 *  Renders null; no per-frame allocations. */
export function FrameStatsProbe() {
  const frames = useRef(0)
  const windowStart = useRef(-1)
  useFrame(({ gl, clock }) => {
    const now = clock.elapsedTime
    if (windowStart.current < 0) windowStart.current = now
    frames.current++
    const elapsed = now - windowStart.current
    if (elapsed < WINDOW_S) return
    frameStats.fps = frames.current / elapsed
    frameStats.ms = (elapsed * 1000) / frames.current
    frameStats.drawCalls = gl.info.render.calls
    frameStats.triangles = gl.info.render.triangles
    frameStats.geometries = gl.info.memory.geometries
    frameStats.textures = gl.info.memory.textures
    frames.current = 0
    windowStart.current = now
  })
  return null
}
