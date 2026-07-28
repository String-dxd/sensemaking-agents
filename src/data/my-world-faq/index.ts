export { FAQ_ASSETS } from './assets'
export { FAQ_GUARDRAILS } from './guardrails'
export {
  FAQ_COMMITTED_QUESTION_TAXONOMY,
  FAQ_CONCERN_CLUSTERS,
  FAQ_QUESTIONS,
} from './questions'
export { FAQ_PRODUCT_PROVENANCE, FAQ_SOURCES } from './sources'
export {
  FAQ_EVIDENCE_LABELS,
  FAQ_GUARDRAIL_STATES,
  type FaqAsset,
  type FaqAssetApproval,
  type FaqAssetKind,
  type FaqConcernCluster,
  type FaqConcernClusterId,
  type FaqEvidenceBlock,
  type FaqEvidenceBlockKind,
  type FaqEvidenceLabel,
  type FaqGuardrail,
  type FaqGuardrailState,
  type FaqProductProvenance,
  type FaqQuestion,
  type FaqReview,
  type FaqReviewStatus,
  type FaqSource,
  type FaqSourceKind,
  type IsoDate,
} from './types'

import { FAQ_QUESTIONS } from './questions'
import type { FaqQuestion } from './types'

function normalizeQuestionKey(value: string): string {
  return value.trim().toLocaleLowerCase('en')
}

export const FAQ_QUESTION_BY_ID = new Map<string, FaqQuestion>(
  FAQ_QUESTIONS.map((question) => [question.id, question] as const),
)

export const FAQ_QUESTION_BY_SLUG = new Map<string, FaqQuestion>(
  FAQ_QUESTIONS.map((question) => [question.slug, question] as const),
)

const FAQ_QUESTION_BY_LANGUAGE = new Map<string, FaqQuestion>()

for (const question of FAQ_QUESTIONS) {
  for (const phrase of [
    question.title,
    ...question.committedQuestions,
    ...question.searchAliases,
  ]) {
    FAQ_QUESTION_BY_LANGUAGE.set(normalizeQuestionKey(phrase), question)
  }
}

export function resolveFaqQuestion(value: string): FaqQuestion | undefined {
  const normalized = normalizeQuestionKey(value)
  return (
    FAQ_QUESTION_BY_ID.get(normalized) ??
    FAQ_QUESTION_BY_SLUG.get(normalized) ??
    FAQ_QUESTION_BY_LANGUAGE.get(normalized)
  )
}
