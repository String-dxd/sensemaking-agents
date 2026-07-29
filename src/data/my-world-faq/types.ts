export const FAQ_EVIDENCE_LABELS = [
  'Product fact',
  'Research-backed',
  'Early field signal · team verify',
  'Open question · pilot',
  'Team check',
] as const

export type FaqEvidenceLabel = (typeof FAQ_EVIDENCE_LABELS)[number]

export const FAQ_GUARDRAIL_STATES = [
  'built-today',
  'required-before-pilot',
  'still-researching',
] as const

export type FaqGuardrailState = (typeof FAQ_GUARDRAIL_STATES)[number]

export type FaqConcernClusterId =
  | 'what-is-my-world'
  | 'human-connection'
  | 'attention-screen-time-motivation'
  | 'ai-safety-student-agency'
  | 'privacy-governance'
  | 'evidence-next-decision'

export type FaqReviewStatus =
  | 'repo-verified'
  | 'source-reviewed'
  | 'team-verification-required'
  | 'pilot-required'
  | 'team-check-required'
  | 'draft-awaiting-human-review'

export type IsoDate = `${number}-${number}-${number}`

export interface FaqReview {
  status: FaqReviewStatus
  reviewerRole: string
  lastReviewed: IsoDate
}

export interface FaqConcernCluster {
  id: FaqConcernClusterId
  label: string
  summary: string
  order: number
}

export type FaqEvidenceBlockKind =
  | 'how-it-works'
  | 'research'
  | 'field-signal'
  | 'unknown'
  | 'pilot-test'

export interface FaqEvidenceBlock {
  id: string
  kind: FaqEvidenceBlockKind
  heading: string
  label: FaqEvidenceLabel
  text: string
  sourceIds: readonly string[]
  provenanceIds: readonly string[]
  guardrailIds: readonly string[]
  populationContext: string
  fit: string
  limitations: string
  review: FaqReview
}

export interface FaqQuestion {
  id: string
  slug: string
  clusterId: FaqConcernClusterId
  order: number
  title: string
  committedQuestions: readonly string[]
  searchAliases: readonly string[]
  shortAnswer: string
  blocks: readonly FaqEvidenceBlock[]
  guardrailIds: readonly string[]
  assetIds: readonly string[]
  review: FaqReview
}

export type FaqSourceKind =
  | 'official-guidance'
  | 'official-policy'
  | 'evidence-review'
  | 'systematic-review'
  | 'meta-analysis'
  | 'primary-study'
  | 'working-paper'

export interface FaqSource {
  id: string
  kind: FaqSourceKind
  title: string
  publisher: string
  authors: readonly string[]
  published: string
  url: string
  identifier?: string
  populationContext: string
  method: string
  fit: string
  limitations: string
  lastChecked: IsoDate
}

export interface FaqProductProvenance {
  id: string
  title: string
  repoPaths: readonly string[]
  claimScope: string
  populationContext: string
  fit: string
  limitations: string
  lastChecked: IsoDate
}

export interface FaqGuardrail {
  id: string
  state: FaqGuardrailState
  title: string
  protects: string
  statusSummary: string
  label: FaqEvidenceLabel
  sourceIds: readonly string[]
  provenanceIds: readonly string[]
  questionIds: readonly string[]
  populationContext: string
  fit: string
  limitations: string
  review: FaqReview
}

export type FaqAssetKind = 'product-step' | 'event-signal'
export type FaqAssetApproval = 'approved' | 'team-check'

export interface FaqAsset {
  id: string
  kind: FaqAssetKind
  publicPath: string
  videoPath?: string
  width: number
  height: number
  alt: string
  transcript: string
  provenance: string
  cropNote: string
  approval: FaqAssetApproval
  capturedOrReceivedOn: IsoDate
  lastReviewed: IsoDate
}
