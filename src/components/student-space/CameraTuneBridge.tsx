import { useEffect } from 'react'
import { Vector3 } from 'three'
import type { Game } from '~/engine/student-space/Game'
import { useCameraPreset } from '~/lib/student-space/camera-tuner'
import { CameraTuneHud, type CameraTuneTargets } from './onboarding/CameraTuneHud'

/**
 * DEV-only bridge: mounts the camera tuner HUD globally and feeds the
 * `world-default` preset into the live engine so tweaks land on the actual
 * static framing without a remount. The HUD itself is hidden until the
 * palette dispatches CAMERA_TUNER_OPEN_EVENT.
 *
 * Lives in its own module (default export) so `EngineHost` can `lazy()` it:
 * both this file and `CameraTuneHud` import three.js at runtime, and a static
 * edge from the host would pull the whole renderer onto the chunk graph the
 * browser must parse before hydration — for a surface only dev builds render.
 */
export default function CameraTuneBridge({ game }: { game: Game }) {
  const worldDefault = useCameraPreset('world-default')
  const view = (game as unknown as { view?: CameraTuneTargets }).view ?? null

  useEffect(() => {
    const camera = view?.camera as
      | {
          setDefaultFraming?: (
            pose: { fov: number; distance: number; pitchDeg: number; target: Vector3 },
            options?: { apply?: boolean },
          ) => void
        }
      | null
      | undefined
    camera?.setDefaultFraming?.({
      fov: worldDefault.fov,
      distance: worldDefault.distance,
      pitchDeg: worldDefault.pitchDeg,
      target: new Vector3(worldDefault.lookAtX, worldDefault.lookAtY, worldDefault.lookAtZ),
    })
  }, [view, worldDefault])

  return <CameraTuneHud targets={view} />
}
