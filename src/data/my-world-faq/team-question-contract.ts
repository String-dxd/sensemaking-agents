import type { FaqEvidenceBlockKind, FaqEvidenceLabel, FaqReviewStatus } from './types'

export const MAX_TEAM_FAQ_QUESTIONS = 50
export const MAX_TEAM_FAQ_ADDITIONS_PER_PUBLISH = 10
export const TEAM_FAQ_QUESTION_ID_PATTERN =
  /^team-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const TEAM_FAQ_QUESTION_REVIEW_STATUS = 'draft-awaiting-human-review' as const
export const TEAM_FAQ_QUESTION_REVIEWER_ROLE = 'My World team'
export const TEAM_FAQ_WORKING_ANSWER_SUFFIX = '-working-answer'

const TEAM_FAQ_FIELD_SIGNAL_PATTERN = /student engagement|teacher support|school field[- ]research/i

export interface TeamFaqWorkingAnswerContract {
  id: string
  kind: FaqEvidenceBlockKind
  label: FaqEvidenceLabel
  sourceIds: string[]
  provenanceIds: string[]
  guardrailIds: string[]
  review: {
    status: FaqReviewStatus
    reviewerRole: string
  }
}

export function isTeamFaqQuestionId(id: string): boolean {
  return TEAM_FAQ_QUESTION_ID_PATTERN.test(id)
}

export function containsTeamFaqFieldSignal(text: string): boolean {
  return TEAM_FAQ_FIELD_SIGNAL_PATTERN.test(text)
}

export function deriveTeamFaqWorkingAnswerContract(
  questionId: string,
  text: string,
): TeamFaqWorkingAnswerContract {
  const fieldSignal = containsTeamFaqFieldSignal(text)
  return {
    id: `${questionId}${TEAM_FAQ_WORKING_ANSWER_SUFFIX}`,
    kind: fieldSignal ? 'field-signal' : 'unknown',
    label: fieldSignal ? 'Early field signal · team verify' : 'Team check',
    sourceIds: [],
    provenanceIds: [],
    guardrailIds: [],
    review: fieldSignal
      ? {
          status: 'team-verification-required',
          reviewerRole: 'Field research lead',
        }
      : {
          status: 'team-check-required',
          reviewerRole: TEAM_FAQ_QUESTION_REVIEWER_ROLE,
        },
  }
}
