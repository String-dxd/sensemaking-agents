// Companion declarations for Choices.js — engine state slice for the
// non-VIPS Profile tab added by
// docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.

export type DecisionForce =
  | 'consequential'
  | 'peer-acceptance'
  | 'values'
  | 'family'
  | 'gut'
  | 'other'

export type DecisionPatternTag = 'avoidant' | 'impulsive' | 'deliberate'

export interface DecisionEntry {
  readonly id: string
  readonly createdAt: string
  readonly decision: string
  readonly options: readonly string[]
  readonly chose: string
  readonly forces: readonly DecisionForce[]
  readonly when: string
  readonly note: string | null
  readonly patternTag: DecisionPatternTag | null
}

export interface ChangeIntention {
  readonly id: string
  readonly createdAt: string
  readonly current: string
  readonly change: string
  readonly byWhen: string | null
  readonly linkedPatternTag: DecisionPatternTag | null
}

export type ChoicesEvent =
  | { kind: 'decisions:add' | 'decisions:update' | 'decisions:remove'; id: string }
  | { kind: 'intentions:add' | 'intentions:update' | 'intentions:remove'; id: string }
  | { kind: 'hydrate' }

export interface ChoicesSnapshot {
  decisions: DecisionEntry[]
  intentions: ChangeIntention[]
}

export const DECISION_PATTERN_TAGS: readonly DecisionPatternTag[]

export default class Choices {
  static instance: Choices | null
  static getInstance(): Choices | null

  decisions: DecisionEntry[]
  intentions: ChangeIntention[]

  constructor()

  listDecisions(): DecisionEntry[]
  listIntentions(): ChangeIntention[]

  dominantPatternTag(): DecisionPatternTag | null
  patternCounts(): Record<DecisionPatternTag, number>

  addDecision(partial: Partial<DecisionEntry>): DecisionEntry | null
  updateDecision(id: string, partial: Partial<DecisionEntry>): DecisionEntry | null
  tagDecisionPattern(id: string, patternTag: DecisionPatternTag | null): DecisionEntry | null
  removeDecision(id: string): string | null

  addChangeIntention(partial: Partial<ChangeIntention>): ChangeIntention | null
  updateChangeIntention(
    id: string,
    partial: Partial<ChangeIntention>,
  ): ChangeIntention | null
  removeChangeIntention(id: string): string | null

  subscribe(cb: (event: ChoicesEvent, self: Choices) => void): () => void

  hydrate(snapshot: Partial<ChoicesSnapshot> | null | undefined): void
  serialize(): ChoicesSnapshot
  dispose(): void
}
