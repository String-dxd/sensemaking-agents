// Studio walk driver (advisor plan 001) — mounts inside the Canvas and, when
// the debug panel's `studioWalk` flag is on and Play mode is not active,
// runs a `createStudioWalk` session (src/core/motion/studioWalk.ts) against
// the live character. This is what makes the Studio "walk circle" button
// articulate limbs via the authored clips instead of only sliding the root.
//
// Entering Play mode force-clears the flag (Play owns the root there) and
// unmounts this driver's session cleanly via the effect's own cleanup.

import { useGLTF } from '@react-three/drei'
import { Suspense, useEffect } from 'react'
import { CANONICAL_BONES } from '../../core/skeleton/canonical'
import { createStudioWalk } from '../../core/motion/studioWalk'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'
import { usePlayStore } from '../play/playStore'
import { useMotionStudio } from '../state/studioStores'

const clipsUrl = new URL('../../assets/clips/clips-core-v1.glb', import.meta.url).href

/** Reference-skeleton hips rest local position (clips were authored on it). */
const REF_HIPS = (() => {
  const hips = CANONICAL_BONES.find((b) => b.name === 'hips')
  if (!hips) throw new Error('canonical skeleton has no hips bone')
  return hips.position
})()

function StudioWalkDriverInner() {
  const character = useMotionStudio((s) => s.character)
  const studioWalk = useMotionStudio((s) => s.studioWalk)
  const mode = usePlayStore((s) => s.mode)
  const gltf = useGLTF(clipsUrl)
  const animations = gltf.animations

  // Entering Play mode force-clears the flag — Play owns the root there.
  useEffect(() => {
    if (mode === 'play') useMotionStudio.getState().setStudioWalk(false)
  }, [mode])

  useEffect(() => {
    if (!studioWalk || mode === 'play' || !character) return
    const session = createStudioWalk(character.root, character.boneByName.values(), animations, {
      hipsRebase: { from: [REF_HIPS[0], REF_HIPS[1], REF_HIPS[2]], to: character.hipsRest },
    })
    // Clips own hips position + head rotation while walking — narrow the idle
    // layer to breath-only, exactly like PlayMode: its sway/microTurn channels
    // write hips.x / head yaw absolutely in the `procedural` phase (which runs
    // AFTER our `animation`-phase clip writes) and would clobber the gait
    // every frame. Read `idle` at effect-run time so a rig rebuild doesn't
    // churn this effect.
    useMotionStudio.getState().idle?.setChannels({ headBob: false, sway: false, microTurn: false })
    const onAnimation = (dt: number) => session.update(dt)
    registerUpdate('animation', onAnimation)
    return () => {
      unregisterUpdate('animation', onAnimation)
      session.dispose()
      useMotionStudio.getState().idle?.setChannels({ headBob: true, sway: true, microTurn: true })
    }
  }, [studioWalk, mode, character, animations])

  return null
}

export function StudioWalkDriver() {
  return (
    <Suspense fallback={null}>
      <StudioWalkDriverInner />
    </Suspense>
  )
}

useGLTF.preload(clipsUrl)
