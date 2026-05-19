interface SproutsSliceShape {
  subscribe(cb: (event: { type: string }) => void): () => void
  serialize(): unknown
}

export default class IslandSnapshotBridge {
  static instance: IslandSnapshotBridge | undefined
  static getInstance(): IslandSnapshotBridge | undefined

  subscribers: Set<(bridge: IslandSnapshotBridge) => void>

  constructor(opts?: {
    sproutsSlice?: SproutsSliceShape | null
    fetch?: typeof fetch
    now?: () => number
  })

  attach(sproutsSlice: SproutsSliceShape | null): void
  dispose(): void
  captureNow(reason?: string): void
  subscribe(cb: (bridge: IslandSnapshotBridge) => void): () => void
}
