export { FAQ_ASSETS } from './assets'
export {
  canonicalizeMyWorldFaqDocument,
  composeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  digestMyWorldFaqDocument,
  normalizeMyWorldFaqDocument,
} from './compose-document'
export {
  FAQ_EDITABLE_FIELDS,
  FAQ_EDITABLE_PATHS,
  FAQ_EDITORIAL_FIELD_LIMITS,
  FAQ_LEDGER_PREVIEW_MANIFEST,
  FAQ_LOCKED_STRUCTURE,
  FAQ_PRODUCT_STEP_MANIFEST,
  FAQ_SIGNAL_QUOTE_MANIFEST,
  type FaqEditorialFieldCategory,
  type FaqEditorialFieldDefinition,
  MY_WORLD_FAQ_SCHEMA_VERSION,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
} from './content-manifest'
export {
  MY_WORLD_FAQ_DOCUMENT_SCHEMA,
  type MyWorldFaqContent,
  type MyWorldFaqEditorialDocument,
  type MyWorldFaqEvidenceBlock,
  type MyWorldFaqProductProvenance,
  type MyWorldFaqQuestion,
  type MyWorldFaqSource,
  type MyWorldFaqValidationIssue,
  type MyWorldFaqValidationResult,
  type MyWorldFaqValidationWarning,
  validateMyWorldFaqDocument,
} from './content-schema'
export { DEFAULT_MY_WORLD_FAQ_DOCUMENT } from './default-document'
export {
  compareMyWorldFaqEditorialVersions,
  type MyWorldFaqEditorialComparisonStatus,
  type MyWorldFaqEditorialFieldComparison,
  type MyWorldFaqEditorialIntentResult,
  type MyWorldFaqEditorialMutationFailureReason,
  type MyWorldFaqEditorialMutationIssue,
  type MyWorldFaqEditorialMutationIssueCode,
  type MyWorldFaqEditorialMutationResult,
  type PrepareMyWorldFaqEditorialIntentInput,
  type PrepareMyWorldFaqEditorialMutationInput,
  prepareMyWorldFaqEditorialIntent,
  prepareMyWorldFaqEditorialMutation,
  readMyWorldFaqManifestPath,
  type StampMyWorldFaqEditorialIntentInput,
  setMyWorldFaqManifestPath,
  stampMyWorldFaqEditorialIntent,
} from './editorial-mutations'
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

import { DEFAULT_MY_WORLD_FAQ_CONTENT } from './compose-document'
import type { MyWorldFaqContent, MyWorldFaqQuestion } from './content-schema'

function normalizeQuestionKey(value: string): string {
  return value.trim().toLocaleLowerCase('en')
}

export const FAQ_QUESTION_BY_ID = new Map<string, MyWorldFaqQuestion>(
  DEFAULT_MY_WORLD_FAQ_CONTENT.questions.map((question) => [question.id, question] as const),
)

export const FAQ_QUESTION_BY_SLUG = new Map<string, MyWorldFaqQuestion>(
  DEFAULT_MY_WORLD_FAQ_CONTENT.questions.map((question) => [question.slug, question] as const),
)

const FAQ_QUESTION_BY_LANGUAGE = new Map<string, MyWorldFaqQuestion>()

for (const question of DEFAULT_MY_WORLD_FAQ_CONTENT.questions) {
  for (const phrase of [
    question.title,
    question.displayedQuestion,
    ...question.committedQuestions,
    ...question.searchAliases,
  ]) {
    FAQ_QUESTION_BY_LANGUAGE.set(normalizeQuestionKey(phrase), question)
  }
}

export function resolveFaqQuestion(
  value: string,
  content: MyWorldFaqContent = DEFAULT_MY_WORLD_FAQ_CONTENT,
): MyWorldFaqQuestion | undefined {
  const normalized = normalizeQuestionKey(value)
  if (content !== DEFAULT_MY_WORLD_FAQ_CONTENT) {
    return content.questions.find(
      (question) =>
        question.id === normalized ||
        question.slug === normalized ||
        [
          question.title,
          question.displayedQuestion,
          ...question.committedQuestions,
          ...question.searchAliases,
        ].some((phrase) => normalizeQuestionKey(phrase) === normalized),
    )
  }
  return (
    FAQ_QUESTION_BY_ID.get(normalized) ??
    FAQ_QUESTION_BY_SLUG.get(normalized) ??
    FAQ_QUESTION_BY_LANGUAGE.get(normalized)
  )
}
