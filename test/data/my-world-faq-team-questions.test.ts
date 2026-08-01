import { describe, expect, it } from 'vitest'
import {
  addTeamFaqQuestion,
  type CreateTeamFaqQuestionInput,
  canonicalizeMyWorldFaqDocument,
  composeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  DEFAULT_MY_WORLD_FAQ_DOCUMENT,
  digestMyWorldFaqDocument,
  getTeamFaqQuestionCapacity,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
  MY_WORLD_FAQ_V1_STRUCTURE_VERSION,
  type MyWorldFaqEditorialDocument,
  prepareMyWorldFaqEditorialMutation,
  updateMyWorldFaqDraftPath,
  validateMyWorldFaqDocument,
} from '~/data/my-world-faq'

const FIRST_TEAM_ID = 'team-11111111-1111-4111-8111-111111111111'
const SECOND_TEAM_ID = 'team-22222222-2222-4222-8222-222222222222'
const REVIEW_DATE = '2026-07-30'
const PUBLISH_DATE = '2026-07-31'
const DEFAULT_CANONICAL_DIGEST = 'fcabc6ff5e308e890806f02064071cb1440668b7319923b96e8d84b7159cf6b9'

function defaultDocument(): MyWorldFaqEditorialDocument {
  return structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
}

function legacyDefaultDocument(): MyWorldFaqEditorialDocument {
  const document = structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
  delete document.page.build
  delete document.page.why
  delete document.page.posture
  return document
}

function validTeamQuestionInput(
  id = FIRST_TEAM_ID,
  overrides: Partial<CreateTeamFaqQuestionInput> = {},
): CreateTeamFaqQuestionInput {
  return {
    id,
    clusterId: 'evidence-next-decision',
    displayedQuestion: 'How will the team decide whether this question is ready?',
    shortAnswer:
      'The team will keep this answer visibly provisional, review the available evidence, and revise or withdraw it before treating the wording as settled.',
    detailedAnswer:
      'This is a working answer from the My World team. It remains open to evidence, review and correction.',
    limitations:
      'This answer has not yet been linked to a reviewed source or an approved product claim.',
    reviewDate: REVIEW_DATE,
    ...overrides,
  }
}

function expectInvalidAt(
  document: MyWorldFaqEditorialDocument,
  path: string,
  code: 'schema' | 'structure' | 'word_count' = 'structure',
) {
  const result = validateMyWorldFaqDocument(document)
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errors).toContainEqual(expect.objectContaining({ path, code }))
}

function lastQuestion(document: MyWorldFaqEditorialDocument) {
  const question = document.questions.at(-1)
  if (!question) throw new Error('Expected the appended question')
  return question
}

function firstQuestion(document: MyWorldFaqEditorialDocument) {
  const question = document.questions[0]
  if (!question) throw new Error('Expected the canonical question')
  return question
}

function generatedTeamId(index: number): string {
  const prefix = index.toString(16).padStart(8, '0')
  const suffix = index.toString(16).padStart(12, '0')
  return `team-${prefix}-0000-4000-8000-${suffix}`
}

function addQuestions(
  document: MyWorldFaqEditorialDocument,
  count: number,
  startAt = 1,
): MyWorldFaqEditorialDocument {
  let next = document
  for (let index = startAt; index < startAt + count; index += 1) {
    next = addTeamFaqQuestion(
      next,
      validTeamQuestionInput(generatedTeamId(index), {
        displayedQuestion: `How should the team review question ${index}?`,
      }),
    )
  }
  return next
}

describe('My World FAQ team-added question contract', () => {
  it('pins the original canonical digest for revisions without projected narrative copy', async () => {
    expect(DEFAULT_MY_WORLD_FAQ_DOCUMENT.structureVersion).toBe(MY_WORLD_FAQ_V1_STRUCTURE_VERSION)
    const legacy = legacyDefaultDocument()
    expect(await digestMyWorldFaqDocument(legacy)).toBe(DEFAULT_CANONICAL_DIGEST)
    expect(canonicalizeMyWorldFaqDocument(legacy)).toBe(JSON.stringify(legacy))
    expect(canonicalizeMyWorldFaqDocument(DEFAULT_MY_WORLD_FAQ_DOCUMENT)).toBe(
      canonicalizeMyWorldFaqDocument(DEFAULT_MY_WORLD_FAQ_CONTENT),
    )
  })

  it('round-trips an appended question through validation, mutation, canonicalization and composition', async () => {
    const base = defaultDocument()
    const submitted = addTeamFaqQuestion(base, validTeamQuestionInput())
    expect(base.structureVersion).toBe(MY_WORLD_FAQ_V1_STRUCTURE_VERSION)
    expect(submitted.structureVersion).toBe(MY_WORLD_FAQ_STRUCTURE_VERSION)

    const validation = validateMyWorldFaqDocument(submitted)
    expect(validation.success).toBe(true)

    const mutation = prepareMyWorldFaqEditorialMutation({
      base,
      submitted,
      reviewDate: PUBLISH_DATE,
    })
    expect(mutation.success).toBe(true)
    if (!mutation.success) return

    expect(mutation.dirtyPaths).toContain(`questions.${FIRST_TEAM_ID}`)
    expect(mutation.stampTargets).toEqual([
      `questions.${FIRST_TEAM_ID}.review.lastReviewed`,
      `questions.${FIRST_TEAM_ID}.blocks.${FIRST_TEAM_ID}-working-answer.review.lastReviewed`,
    ])

    const canonical = canonicalizeMyWorldFaqDocument(mutation.document)
    const recomposed = composeMyWorldFaqDocument(JSON.parse(canonical))
    const added = recomposed.questions.at(-1)

    expect(recomposed.questions).toHaveLength(base.questions.length + 1)
    expect(added).toMatchObject({
      id: FIRST_TEAM_ID,
      slug: FIRST_TEAM_ID,
      clusterId: 'evidence-next-decision',
      review: {
        status: 'draft-awaiting-human-review',
        reviewerRole: 'My World team',
        lastReviewed: PUBLISH_DATE,
      },
      blocks: [
        expect.objectContaining({
          id: `${FIRST_TEAM_ID}-working-answer`,
          kind: 'unknown',
          label: 'Team check',
          review: {
            status: 'team-check-required',
            reviewerRole: 'My World team',
            lastReviewed: PUBLISH_DATE,
          },
        }),
      ],
    })
    expect(canonicalizeMyWorldFaqDocument(recomposed)).toBe(canonical)
    expect(await digestMyWorldFaqDocument(recomposed)).not.toBe(DEFAULT_CANONICAL_DIGEST)
  })

  it('binds team questions to v2 without rewriting neutral v1 edits', () => {
    const base = defaultDocument()
    const neutral = structuredClone(base)
    neutral.route.title = `${neutral.route.title} — revised`
    const neutralMutation = prepareMyWorldFaqEditorialMutation({
      base,
      submitted: neutral,
      reviewDate: PUBLISH_DATE,
    })
    expect(neutralMutation.success).toBe(true)
    if (neutralMutation.success) {
      expect(neutralMutation.document.structureVersion).toBe(MY_WORLD_FAQ_V1_STRUCTURE_VERSION)
    }

    const v1WithTeam = addTeamFaqQuestion(base, validTeamQuestionInput())
    v1WithTeam.structureVersion = MY_WORLD_FAQ_V1_STRUCTURE_VERSION
    expectInvalidAt(v1WithTeam, 'structureVersion')

    const emptyV2 = structuredClone(base)
    emptyV2.structureVersion = MY_WORLD_FAQ_STRUCTURE_VERSION
    expectInvalidAt(emptyV2, 'structureVersion')

    const manualUpgrade = structuredClone(base)
    manualUpgrade.structureVersion = MY_WORLD_FAQ_STRUCTURE_VERSION
    expect(
      prepareMyWorldFaqEditorialMutation({
        base,
        submitted: manualUpgrade,
        reviewDate: PUBLISH_DATE,
      }),
    ).toMatchObject({
      success: false,
      reason: 'non_editable_change',
      issues: [expect.objectContaining({ path: 'structureVersion' })],
    })

    const v2Base = addTeamFaqQuestion(base, validTeamQuestionInput())
    const downgrade = structuredClone(v2Base)
    downgrade.structureVersion = MY_WORLD_FAQ_V1_STRUCTURE_VERSION
    expect(
      prepareMyWorldFaqEditorialMutation({
        base: v2Base,
        submitted: downgrade,
        reviewDate: PUBLISH_DATE,
      }),
    ).toMatchObject({
      success: false,
      reason: 'non_editable_change',
      issues: [expect.objectContaining({ path: 'structureVersion' })],
    })
  })

  it('derives review metadata from working-answer text in both directions', () => {
    const neutral = addTeamFaqQuestion(defaultDocument(), validTeamQuestionInput())
    const textPath = `questions.${FIRST_TEAM_ID}.blocks.${FIRST_TEAM_ID}-working-answer.text`
    const fieldText =
      'School field research found student engagement and teacher support signals that still require team verification.'
    const fieldSignal = updateMyWorldFaqDraftPath(neutral, neutral, textPath, fieldText)
    const fieldBlock = lastQuestion(fieldSignal).blocks[0]
    expect(fieldBlock).toMatchObject({
      kind: 'field-signal',
      label: 'Early field signal · team verify',
      review: {
        status: 'team-verification-required',
        reviewerRole: 'Field research lead',
      },
    })

    const fieldMutation = prepareMyWorldFaqEditorialMutation({
      base: neutral,
      submitted: fieldSignal,
      reviewDate: PUBLISH_DATE,
    })
    expect(fieldMutation.success).toBe(true)
    if (fieldMutation.success) {
      expect(lastQuestion(fieldMutation.document).blocks[0]?.review.lastReviewed).toBe(PUBLISH_DATE)
    }

    const neutralAgain = updateMyWorldFaqDraftPath(
      fieldSignal,
      fieldSignal,
      textPath,
      'This is a revised working answer that remains open to review and correction.',
    )
    expect(lastQuestion(neutralAgain).blocks[0]).toMatchObject({
      kind: 'unknown',
      label: 'Team check',
      review: {
        status: 'team-check-required',
        reviewerRole: 'My World team',
      },
    })
    expect(
      prepareMyWorldFaqEditorialMutation({
        base: fieldSignal,
        submitted: neutralAgain,
        reviewDate: PUBLISH_DATE,
      }).success,
    ).toBe(true)

    const forged = structuredClone(fieldSignal)
    const forgedBlock = lastQuestion(forged).blocks[0]
    if (!forgedBlock) throw new Error('Expected the working-answer block')
    forgedBlock.label = 'Team check'
    expect(
      prepareMyWorldFaqEditorialMutation({
        base: neutral,
        submitted: forged,
        reviewDate: PUBLISH_DATE,
      }),
    ).toMatchObject({
      success: false,
    })
  })

  it('reports draft and lifetime question capacity at their boundaries', () => {
    const base = defaultDocument()
    const nineDrafts = addQuestions(base, 9)
    const tenDrafts = addQuestions(base, 10)
    const elevenDrafts = addQuestions(base, 11)

    expect(getTeamFaqQuestionCapacity(base, nineDrafts)).toMatchObject({
      unpublishedCount: 9,
      disabledReason: null,
    })
    expect(getTeamFaqQuestionCapacity(base, tenDrafts)).toMatchObject({
      unpublishedCount: 10,
      disabledReason: 'Publish these 10 new questions before adding more.',
    })
    expect(getTeamFaqQuestionCapacity(base, elevenDrafts)).toMatchObject({
      unpublishedCount: 11,
      disabledReason: 'Publish these 10 new questions before adding more.',
    })

    const fortyNinePublished = addQuestions(base, 49)
    const fiftyPublished = addTeamFaqQuestion(
      fortyNinePublished,
      validTeamQuestionInput(generatedTeamId(50)),
    )
    expect(getTeamFaqQuestionCapacity(fortyNinePublished, fortyNinePublished)).toMatchObject({
      totalCount: 49,
      disabledReason: null,
    })
    expect(getTeamFaqQuestionCapacity(fiftyPublished, fiftyPublished)).toMatchObject({
      totalCount: 50,
      disabledReason: 'This FAQ already has the maximum of 50 team-added questions.',
    })
    expect(() =>
      addTeamFaqQuestion(fiftyPublished, validTeamQuestionInput(generatedTeamId(51))),
    ).toThrow('The FAQ can contain up to 50 team-added questions.')
  })

  it('rejects eleven appended questions at the editorial mutation boundary', () => {
    const base = defaultDocument()
    const submitted = addQuestions(base, 11)

    expect(
      prepareMyWorldFaqEditorialMutation({
        base,
        submitted,
        reviewDate: PUBLISH_DATE,
      }),
    ).toMatchObject({
      success: false,
      reason: 'non_editable_change',
      issues: [
        expect.objectContaining({
          path: 'questions',
          code: 'non_editable_change',
          message: 'Add up to 10 questions in one publication.',
        }),
      ],
    })
  })

  it('preserves XSS-like author text literally as inert content data', () => {
    const xssLikeText =
      '<script>globalThis.pwned = true</script><img src=x onerror=alert(1)> {dangerouslySetInnerHTML}'
    const submitted = addTeamFaqQuestion(
      defaultDocument(),
      validTeamQuestionInput(FIRST_TEAM_ID, {
        displayedQuestion: 'Will <script>alert("question")</script> remain plain text?',
        detailedAnswer: xssLikeText,
      }),
    )

    const validation = validateMyWorldFaqDocument(submitted)
    expect(validation.success).toBe(true)
    if (!validation.success) return

    const canonical = canonicalizeMyWorldFaqDocument(validation.document)
    const recomposed = composeMyWorldFaqDocument(JSON.parse(canonical))
    const added = recomposed.questions.at(-1)

    expect(added?.displayedQuestion).toBe(
      'Will <script>alert("question")</script> remain plain text?',
    )
    expect(added?.title).toBe('Will <script>alert("question")</script> remain plain text?')
    expect(added?.blocks[0]?.text).toBe(xssLikeText)
    expect(canonical).toContain('<script>')
  })

  it('rejects malformed identity, topic, review authority and answer structure', () => {
    const malformedId = addTeamFaqQuestion(defaultDocument(), validTeamQuestionInput(FIRST_TEAM_ID))
    const malformed = malformedId.questions.at(-1)
    if (!malformed) throw new Error('Expected the appended question')
    const malformedBlock = malformed.blocks[0]
    if (!malformedBlock) throw new Error('Expected the working-answer block')
    malformed.id = 'team.with.a.dot'
    malformed.slug = 'team.with.a.dot'
    malformed.blocks[0] = {
      ...malformedBlock,
      id: 'team.with.a.dot-working-answer',
    }
    expectInvalidAt(malformedId, 'questions.team.with.a.dot.id')

    const unknownTopic = addTeamFaqQuestion(
      defaultDocument(),
      validTeamQuestionInput(FIRST_TEAM_ID),
    )
    lastQuestion(unknownTopic).clusterId = 'not-a-real-topic'
    expectInvalidAt(unknownTopic, `questions.${FIRST_TEAM_ID}.clusterId`)

    const forgedReview = addTeamFaqQuestion(
      defaultDocument(),
      validTeamQuestionInput(FIRST_TEAM_ID),
    )
    lastQuestion(forgedReview).review = {
      status: 'source-reviewed',
      reviewerRole: 'Self-certified',
      lastReviewed: REVIEW_DATE,
    }
    expectInvalidAt(forgedReview, `questions.${FIRST_TEAM_ID}.review`)

    const forgedEvidence = addTeamFaqQuestion(
      defaultDocument(),
      validTeamQuestionInput(FIRST_TEAM_ID),
    )
    const forgedQuestion = lastQuestion(forgedEvidence)
    const forgedBlock = forgedQuestion.blocks[0]
    if (!forgedBlock) throw new Error('Expected the working-answer block')
    forgedQuestion.blocks[0] = {
      ...forgedBlock,
      kind: 'research',
      label: 'Research-backed',
      sourceIds: ['not-a-real-source'],
      review: {
        status: 'source-reviewed',
        reviewerRole: 'Self-certified',
        lastReviewed: REVIEW_DATE,
      },
    }
    expectInvalidAt(forgedEvidence, `questions.${FIRST_TEAM_ID}.blocks`)

    const shortAnswer = addTeamFaqQuestion(defaultDocument(), validTeamQuestionInput(FIRST_TEAM_ID))
    lastQuestion(shortAnswer).shortAnswer = 'Too short.'
    expectInvalidAt(shortAnswer, `questions.${FIRST_TEAM_ID}.shortAnswer`, 'word_count')
  })

  it('rejects duplicate question and slug identities', () => {
    const duplicateCanonical = defaultDocument()
    const canonicalQuestion = firstQuestion(duplicateCanonical)
    duplicateCanonical.questions.push(structuredClone(canonicalQuestion))
    const canonicalId = canonicalQuestion.id
    expectInvalidAt(duplicateCanonical, `questions.${canonicalId}.id`)

    const duplicateTeam = addTeamFaqQuestion(
      defaultDocument(),
      validTeamQuestionInput(FIRST_TEAM_ID),
    )
    const second = addTeamFaqQuestion(
      duplicateTeam,
      validTeamQuestionInput(SECOND_TEAM_ID, {
        displayedQuestion: 'How is a second provisional question reviewed?',
      }),
    )
    lastQuestion(second).slug = FIRST_TEAM_ID
    expectInvalidAt(second, `questions.${SECOND_TEAM_ID}.slug`)
  })

  it('authorizes additions relative to the loaded base without allowing replacement or removal', () => {
    const original = defaultDocument()
    const base = addTeamFaqQuestion(original, validTeamQuestionInput(FIRST_TEAM_ID))

    const removed = structuredClone(base)
    removed.questions.pop()
    const removal = prepareMyWorldFaqEditorialMutation({
      base,
      submitted: removed,
      reviewDate: PUBLISH_DATE,
    })
    expect(removal).toMatchObject({
      success: false,
      reason: 'non_editable_change',
      issues: [expect.objectContaining({ path: 'questions', code: 'non_editable_change' })],
    })

    const replacement = addTeamFaqQuestion(
      original,
      validTeamQuestionInput(SECOND_TEAM_ID, {
        displayedQuestion: 'Can a replacement silently take the first question’s place?',
      }),
    )
    const replacementResult = prepareMyWorldFaqEditorialMutation({
      base,
      submitted: replacement,
      reviewDate: PUBLISH_DATE,
    })
    expect(replacementResult).toMatchObject({
      success: false,
      reason: 'non_editable_change',
      issues: [expect.objectContaining({ path: 'questions', code: 'non_editable_change' })],
    })

    const appended = addTeamFaqQuestion(
      base,
      validTeamQuestionInput(SECOND_TEAM_ID, {
        displayedQuestion: 'Can another reviewed question be appended safely?',
      }),
    )
    const addition = prepareMyWorldFaqEditorialMutation({
      base,
      submitted: appended,
      reviewDate: PUBLISH_DATE,
    })
    expect(addition.success).toBe(true)
    if (!addition.success) return
    expect(addition.document.questions.slice(-2).map((question) => question.id)).toEqual([
      FIRST_TEAM_ID,
      SECOND_TEAM_ID,
    ])
  })
})
