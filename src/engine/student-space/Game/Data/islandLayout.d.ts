// Companion declarations for islandLayout.js

export type PlacedObjectKind = 'tree' | 'flower' | 'fruit' | 'mailbox' | 'telescope'

export interface PlacedObject {
  id: string
  kind: PlacedObjectKind
  species?: string
  x: number
  z: number
  yaw?: number
  scale?: number
  locked?: boolean
}

export interface IslandLayout {
  v: 1
  objects: PlacedObject[]
}

export function flowerBasePlacement(
  i: number,
  seed?: number,
  islandRadius?: number,
): { x: number; z: number; yaw: number }

export function defaultIslandLayout(): IslandLayout
export function defaultIslandLayoutFromConstants(): IslandLayout
