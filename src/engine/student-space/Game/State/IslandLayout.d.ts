// Companion declarations for IslandLayout.js

export type PlacedObjectKind = 'tree' | 'flower' | 'fruit' | 'mailbox' | 'telescope'

export interface PlacedObject {
  readonly id: string
  readonly kind: PlacedObjectKind
  readonly species?: string
  readonly x: number
  readonly z: number
  readonly yaw?: number
  readonly scale?: number
  readonly locked?: boolean
}

export interface IslandLayoutSnapshot {
  readonly v: 1
  readonly objects: readonly PlacedObject[]
}

export type IslandLayoutEvent =
  | { type: 'objectAdded'; object: PlacedObject }
  | { type: 'objectRemoved'; object: PlacedObject }
  | { type: 'objectUpdated'; object: PlacedObject }
  | { type: 'layoutReplaced'; layout: IslandLayoutSnapshot }

export default class IslandLayout {
  static instance: IslandLayout | null
  static getInstance(): IslandLayout | null

  objects: PlacedObject[]

  constructor()

  list(): readonly PlacedObject[]
  listByKind(kind: PlacedObjectKind): readonly PlacedObject[]
  get(id: string): Readonly<PlacedObject> | undefined

  addObject(obj: unknown): void
  removeObject(id: string): void
  updateObject(id: string, patch: Partial<PlacedObject>): void
  moveObject(id: string, pos: { x: number; z: number }): void
  setLayout(layout: unknown): void
  revertToDefault(): void

  isDiverged(): boolean

  subscribe(cb: (event: IslandLayoutEvent) => void): () => void

  hydrate(snapshot: unknown, island?: import('./Island.js').default): void
  serialize(): { v: 1; objects: PlacedObject[] }
}

/** U11: snap a hydrated layout's invalid positions to the nearest flat land
 *  cell (occupancy pre-seeded from the spec's decorative objects). */
export function snapLayoutPositions(
  objects: Array<{ x: number; z: number }>,
  island: import('./Island.js').default,
): void
