import { createPortal } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import type { Object3D, Texture } from 'three'
import type { SlotState } from '../bird/birdConfig'
import { buildItem, recolorItem } from '../rig/buildItem'

// A worn item, portaled into its attach node so it inherits the node's world
// transform (position + the base's display scale). V1 items are rigid; skinned
// garments (skeleton-rebind) are the authored-asset path (see ASSET-CONTRACT).
//
// The caller (scene/Bird.tsx) keys this component on the bird's build identity,
// so a bird rebuild (mode/species/part/colour switch) REMOUNTS it and the portal
// mounts fresh into the new attach node. createPortal does not re-render on a
// changed container, so without that remount a worn item would vanish after a
// rebuild (the "clothes disappear when switching species" bug).
export function Clothing({
  state,
  attachNode,
  gradient,
}: {
  state: SlotState
  attachNode: Object3D
  gradient: Texture
}) {
  const built = useMemo(() => buildItem(state.itemId, gradient, state.colors), [state.itemId, gradient])

  useLayoutEffect(() => {
    if (built) recolorItem(built.group, state.colors)
  }, [built, state.colors])

  if (!built) return null
  const { group, fit } = built
  return createPortal(
    <primitive object={group} position={fit.position} rotation={fit.rotation ?? [0, 0, 0]} scale={fit.scale} />,
    attachNode,
  )
}
