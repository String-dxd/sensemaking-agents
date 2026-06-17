import { createPortal } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import type { Object3D, Texture } from 'three'
import type { SlotState } from '../bird/birdConfig'
import { buildItem, recolorItem } from '../rig/buildItem'

// A worn item, portaled into its attach node so it inherits the node's world
// transform (position + the base's 0.30 scale). V1 items are rigid; skinned
// garments (skeleton-rebind) are the authored-asset path (see ASSET-CONTRACT).
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
    <primitive
      object={group}
      position={fit.position}
      rotation={fit.rotation ?? [0, 0, 0]}
      scale={fit.scale}
    />,
    attachNode,
  )
}
