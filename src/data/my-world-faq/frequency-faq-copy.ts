export const MY_WORLD_FAQ_FREQUENCY_QUESTION_ID = 'reflection-research'

export const MY_WORLD_FAQ_FREQUENCY_QUESTION_COPY = {
  displayedQuestion: 'Why capture small moments instead of relying on one long survey?',
  shortAnswer:
    'One long survey offers depth at one moment. Brief captures may preserve changing context and reveal patterns across days. That is our design rationale, not proof that My World improves honesty or outcomes.',
} as const

const LEGACY_REFLECTION_RESEARCH_COPY = {
  displayedQuestion: 'What research supports reflection?',
  shortAnswer:
    'Research suggests structured reflection can help adolescents, but findings are small and not decisive. It does not show that voice beats writing, AI improves reflection or My World works in Singapore.',
} as const

type QuestionCopyDocument = {
  questions: Array<{
    id: string
    displayedQuestion: string
    shortAnswer: string
  }>
}

/**
 * Upgrade only untouched legacy copy at read/editor boundaries. Historical
 * revision bodies remain unchanged, and any colleague-authored wording wins.
 */
export function materializeMyWorldFaqFrequencyQuestionCopy<T extends QuestionCopyDocument>(
  document: T,
): T {
  let changed = false
  const questions = document.questions.map((question) => {
    if (question.id !== MY_WORLD_FAQ_FREQUENCY_QUESTION_ID) return question

    const displayedQuestion =
      question.displayedQuestion === LEGACY_REFLECTION_RESEARCH_COPY.displayedQuestion
        ? MY_WORLD_FAQ_FREQUENCY_QUESTION_COPY.displayedQuestion
        : question.displayedQuestion
    const shortAnswer =
      question.shortAnswer === LEGACY_REFLECTION_RESEARCH_COPY.shortAnswer
        ? MY_WORLD_FAQ_FREQUENCY_QUESTION_COPY.shortAnswer
        : question.shortAnswer

    if (displayedQuestion === question.displayedQuestion && shortAnswer === question.shortAnswer) {
      return question
    }

    changed = true
    return { ...question, displayedQuestion, shortAnswer }
  })

  return changed ? ({ ...document, questions } as T) : document
}
