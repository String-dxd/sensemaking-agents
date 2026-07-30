export { FAQ_ASSETS } from './assets'
export {
  canonicalizeMyWorldFaqDocument,
  composeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  digestMyWorldFaqDocument,
  normalizeMyWorldFaqDocument,
} from './compose-document'
export {
  buildMyWorldFaqEditableFields,
  FAQ_EDITABLE_FIELDS,
  FAQ_EDITABLE_PATHS,
  FAQ_EDITORIAL_FIELD_LIMITS,
  FAQ_LEDGER_PREVIEW_MANIFEST,
  FAQ_LOCKED_STRUCTURE,
  FAQ_PRODUCT_STEP_MANIFEST,
  FAQ_SIGNAL_QUOTE_MANIFEST,
  type FaqEditorialFieldCategory,
  type FaqEditorialFieldDefinition,
  isSupportedMyWorldFaqStructureVersion,
  MY_WORLD_FAQ_SCHEMA_VERSION,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
  MY_WORLD_FAQ_SUPPORTED_STRUCTURE_VERSIONS,
  MY_WORLD_FAQ_V1_STRUCTURE_VERSION,
  type MyWorldFaqStructureVersion,
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
  updateMyWorldFaqDraftPath,
} from './editorial-mutations'
export { FAQ_GUARDRAILS } from './guardrails'
export {
  FAQ_COMMITTED_QUESTION_TAXONOMY,
  FAQ_CONCERN_CLUSTERS,
  FAQ_QUESTIONS,
} from './questions'
export { FAQ_PRODUCT_PROVENANCE, FAQ_SOURCES } from './sources'
export {
  containsTeamFaqFieldSignal,
  deriveTeamFaqWorkingAnswerContract,
  isTeamFaqQuestionId,
  MAX_TEAM_FAQ_ADDITIONS_PER_PUBLISH,
  MAX_TEAM_FAQ_QUESTIONS,
  TEAM_FAQ_QUESTION_ID_PATTERN,
  TEAM_FAQ_QUESTION_REVIEW_STATUS,
  TEAM_FAQ_QUESTION_REVIEWER_ROLE,
  TEAM_FAQ_WORKING_ANSWER_SUFFIX,
  type TeamFaqWorkingAnswerContract,
} from './team-question-contract'
export {
  addTeamFaqQuestion,
  type CreateTeamFaqQuestionInput,
  createTeamFaqQuestion,
  getTeamFaqQuestionCapacity,
  type TeamFaqQuestionCapacity,
} from './team-questions'
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
