// Companion declarations for Relationships.js — engine state slice for the
// non-VIPS Profile tabs added by
// docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.

export type RelationshipCategory = 'family' | 'cca' | 'close-friend' | 'teacher' | 'other'
export type RelationshipQuality = 'rely-on' | 'give-to' | 'mutual' | 'uncertain'

export interface RelationshipMapEntry {
  readonly id: string
  readonly createdAt: string
  readonly name: string
  readonly category: RelationshipCategory
  readonly quality: RelationshipQuality | null
  readonly note: string | null
}

export type BelongGroupKind = 'cca' | 'class' | 'school' | 'society' | 'other'
export type BelongLevel = 'belong' | 'participate' | 'edge'

export interface BelongingEntry {
  readonly id: string
  readonly createdAt: string
  readonly groupKind: BelongGroupKind
  readonly groupName: string
  readonly belongLevel: BelongLevel
  readonly note: string | null
}

export type PerspectiveSource = 'peer' | 'teacher' | 'coach' | 'family' | 'other'
export type PerspectiveAgreement = 'matches' | 'partly' | 'differs' | 'unknown'
export type VipsDimensionRef = 'values' | 'interests' | 'personality' | 'skills'

export interface OutsidePerspectiveEntry {
  readonly id: string
  readonly createdAt: string
  readonly source: PerspectiveSource
  readonly sourceLabel: string | null
  readonly observation: string
  readonly vipsDimensionRef: VipsDimensionRef | null
  readonly agreementSelf: PerspectiveAgreement
}

export type RelationshipsEvent =
  | { kind: 'map:add' | 'map:update' | 'map:remove'; id: string }
  | { kind: 'belonging:add' | 'belonging:update' | 'belonging:remove'; id: string }
  | { kind: 'perspectives:add' | 'perspectives:update' | 'perspectives:remove'; id: string }
  | { kind: 'hydrate' }

export interface RelationshipsSnapshot {
  map: RelationshipMapEntry[]
  belonging: BelongingEntry[]
  perspectives: OutsidePerspectiveEntry[]
}

export default class Relationships {
  static instance: Relationships | null
  static getInstance(): Relationships | null

  map: RelationshipMapEntry[]
  belonging: BelongingEntry[]
  perspectives: OutsidePerspectiveEntry[]

  constructor()

  listMap(): RelationshipMapEntry[]
  listBelonging(): BelongingEntry[]
  listPerspectives(): OutsidePerspectiveEntry[]

  addPerson(partial: Partial<RelationshipMapEntry>): RelationshipMapEntry | null
  updatePerson(id: string, partial: Partial<RelationshipMapEntry>): RelationshipMapEntry | null
  removePerson(id: string): string | null

  addBelonging(partial: Partial<BelongingEntry>): BelongingEntry | null
  updateBelonging(id: string, partial: Partial<BelongingEntry>): BelongingEntry | null
  removeBelonging(id: string): string | null

  addPerspective(partial: Partial<OutsidePerspectiveEntry>): OutsidePerspectiveEntry | null
  updatePerspective(
    id: string,
    partial: Partial<OutsidePerspectiveEntry>,
  ): OutsidePerspectiveEntry | null
  removePerspective(id: string): string | null

  subscribe(cb: (event: RelationshipsEvent, self: Relationships) => void): () => void

  hydrate(snapshot: Partial<RelationshipsSnapshot> | null | undefined): void
  serialize(): RelationshipsSnapshot
  dispose(): void
}
