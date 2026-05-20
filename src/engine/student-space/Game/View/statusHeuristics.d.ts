// Companion declarations for statusHeuristics.js — the CCE identity-status
// classifier feeding the Path Finder redesign
// (docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md).

export type IdentityStatusId =
  | 'starter'
  | 'diffused'
  | 'searching'
  | 'foreclosed'
  | 'achieved'

export interface IdentityStatusAudit {
  status: IdentityStatusId
  exploration: {
    score: number
    band: 'low' | 'emerging' | 'high'
    inputs: {
      distinctClaims: number
      weightedQuotes: number
      askCount: number
      hasBackendCartographer: boolean
    }
  }
  commitment: {
    score: number
    band: 'low' | 'high'
    inputs: {
      decisionCount: number
      intentionCount: number
      dominantPatternTag: string | null
    }
  }
  reason: string
}

export interface StatusCopy {
  eyebrow: string
  title: string
  lead: string
}

export interface IdentitySource {
  name?: string | null
}

export interface QuoteShape {
  canonicalClaimId?: string
  confidence?: 'low' | 'medium' | 'high'
}

export interface FacetShape {
  quotes?: readonly QuoteShape[]
}

export type FacetsInput = Record<string, FacetShape | undefined> | null | undefined

export interface CaptureShape {
  kind?: string
  backendCartographerOutputId?: string | number | null
}

export interface ChoiceDecisionShape {
  id?: string
  patternTag?: string | null
}

export interface ChoiceIntentionShape {
  id?: string
}

export interface StatusForInput {
  facets?: FacetsInput
  captures?: readonly CaptureShape[] | null
  decisions?: readonly ChoiceDecisionShape[] | null
  intentions?: readonly ChoiceIntentionShape[] | null
  dominantPatternTag?: string | null
}

export const STATUS_IDS: readonly IdentityStatusId[]

export function statusFor(input?: StatusForInput): IdentityStatusAudit

export function statusLabelOf(id: IdentityStatusId | string): string

export function statusCopyOf(
  id: IdentityStatusId | string,
  identity: IdentitySource | null | undefined,
): StatusCopy

export interface NudgePrompt {
  id: string
  title: string
  prompt: string
}

export const DIFFUSED_NUDGES: readonly NudgePrompt[]
export const STARTER_PROMPT: NudgePrompt
export const FORECLOSED_CHALLENGE_PROMPT: NudgePrompt

export function actionsForCluster(clusterId: string | null | undefined): readonly string[]
