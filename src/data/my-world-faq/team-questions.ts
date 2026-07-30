import { MY_WORLD_FAQ_STRUCTURE_VERSION } from './content-manifest'
import type { MyWorldFaqEditorialDocument, MyWorldFaqQuestion } from './content-schema'
import {
  deriveTeamFaqWorkingAnswerContract,
  isTeamFaqQuestionId,
  MAX_TEAM_FAQ_ADDITIONS_PER_PUBLISH,
  MAX_TEAM_FAQ_QUESTIONS,
  TEAM_FAQ_QUESTION_REVIEW_STATUS,
  TEAM_FAQ_QUESTION_REVIEWER_ROLE,
} from './team-question-contract'

export interface CreateTeamFaqQuestionInput {
  id: string
  clusterId: string
  displayedQuestion: string
  shortAnswer: string
  detailedAnswer: string
  limitations: string
  reviewDate: string
}

export interface TeamFaqQuestionCapacity {
  unpublishedCount: number
  totalCount: number
  disabledReason: string | null
}

export function getTeamFaqQuestionCapacity(
  base: MyWorldFaqEditorialDocument,
  document: MyWorldFaqEditorialDocument,
): TeamFaqQuestionCapacity {
  const baseIds = new Set(base.questions.map((question) => question.id))
  const totalCount = document.questions.filter((question) =>
    isTeamFaqQuestionId(question.id),
  ).length
  const unpublishedCount = document.questions.filter(
    (question) => isTeamFaqQuestionId(question.id) && !baseIds.has(question.id),
  ).length

  if (totalCount >= MAX_TEAM_FAQ_QUESTIONS) {
    return {
      unpublishedCount,
      totalCount,
      disabledReason: `This FAQ already has the maximum of ${MAX_TEAM_FAQ_QUESTIONS} team-added questions.`,
    }
  }
  if (unpublishedCount >= MAX_TEAM_FAQ_ADDITIONS_PER_PUBLISH) {
    return {
      unpublishedCount,
      totalCount,
      disabledReason: `Publish these ${MAX_TEAM_FAQ_ADDITIONS_PER_PUBLISH} new questions before adding more.`,
    }
  }
  return { unpublishedCount, totalCount, disabledReason: null }
}

export function createTeamFaqQuestion(
  document: MyWorldFaqEditorialDocument,
  input: CreateTeamFaqQuestionInput,
): MyWorldFaqQuestion {
  if (!isTeamFaqQuestionId(input.id)) {
    throw new Error('Team FAQ question IDs must use the generated team UUID format.')
  }
  if (!document.concernClusters.some((cluster) => cluster.id === input.clusterId)) {
    throw new Error('Choose an existing FAQ topic.')
  }
  if (document.questions.some((question) => question.id === input.id)) {
    throw new Error('This FAQ question ID is already in use.')
  }
  if (
    document.questions.filter((question) => isTeamFaqQuestionId(question.id)).length >=
    MAX_TEAM_FAQ_QUESTIONS
  ) {
    throw new Error(`The FAQ can contain up to ${MAX_TEAM_FAQ_QUESTIONS} team-added questions.`)
  }

  const order =
    Math.max(
      0,
      ...document.questions
        .filter((question) => question.clusterId === input.clusterId)
        .map((question) => question.order),
    ) + 1
  const workingAnswerContract = deriveTeamFaqWorkingAnswerContract(input.id, input.detailedAnswer)
  const questionReview = {
    status: TEAM_FAQ_QUESTION_REVIEW_STATUS,
    reviewerRole: TEAM_FAQ_QUESTION_REVIEWER_ROLE,
    lastReviewed: input.reviewDate,
  }

  return {
    id: input.id,
    slug: input.id,
    clusterId: input.clusterId,
    order,
    title: input.displayedQuestion,
    displayedQuestion: input.displayedQuestion,
    committedQuestions: [],
    searchAliases: [],
    shortAnswer: input.shortAnswer,
    blocks: [
      {
        ...workingAnswerContract,
        heading: 'Working answer',
        text: input.detailedAnswer,
        populationContext: 'My World’s current prototype and the audience question above.',
        fit: 'This is the team’s working answer for review.',
        limitations: input.limitations,
        review: {
          ...workingAnswerContract.review,
          lastReviewed: input.reviewDate,
        },
      },
    ],
    guardrailIds: [],
    assetIds: [],
    review: questionReview,
  }
}

export function addTeamFaqQuestion(
  document: MyWorldFaqEditorialDocument,
  input: CreateTeamFaqQuestionInput,
): MyWorldFaqEditorialDocument {
  const question = createTeamFaqQuestion(document, input)
  const updated = structuredClone(document)
  updated.structureVersion = MY_WORLD_FAQ_STRUCTURE_VERSION
  updated.questions.push(question)
  return updated
}
