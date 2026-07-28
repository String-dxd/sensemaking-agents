import { describe, expect, it } from 'vitest'
import {
  FAQ_ASSETS,
  FAQ_COMMITTED_QUESTION_TAXONOMY,
  FAQ_CONCERN_CLUSTERS,
  FAQ_EVIDENCE_LABELS,
  FAQ_GUARDRAIL_STATES,
  FAQ_GUARDRAILS,
  FAQ_PRODUCT_PROVENANCE,
  FAQ_QUESTIONS,
  FAQ_SOURCES,
  resolveFaqQuestion,
} from '~/data/my-world-faq'

const EXPECTED_COMMITTED_QUESTIONS = [
  'What problem is it solving?',
  'Is it just another chatbot?',
  'Why not a paper journal?',
  'How does Capture become VIPS and a timeline?',
  'What does Kira do, and what does Kira not do?',
  'Are we replacing the dinner table?',
  'What if a student prefers Kira to a parent, teacher, or friend?',
  'Is Kira designed to feel like a friend?',
  'What about students without a safe place to talk at home?',
  "Could My World become a student's only support?",
  'Is it addictive?',
  'Will it add to already-high PLD screen time?',
  'Why use an island?',
  'Is this superficial gamification?',
  'Does more capturing grow the world faster than better reflection?',
  'Are there streaks, scores, rewards, rankings, or competition?',
  'What stops endless conversation?',
  'Is Kira a counsellor or therapist?',
  'Can it give harmful advice?',
  'Will it simply agree with students?',
  'What happens if a student mentions harm?',
  'Can one emotional moment become a fixed identity label?',
  'Can students challenge, correct, or forget an interpretation?',
  'How are bias, language, Singlish, disability, and cultural fit handled?',
  'Who can see a reflection?',
  'Does MOE “hold all this data”?',
  'Are voice recordings or photos retained?',
  'Are transcripts retained?',
  'Do model providers train on student data?',
  'Where is data stored, for how long, and who can delete it?',
  'Can parents or teachers inspect private entries?',
  'Is participation optional?',
  'What student need has been validated?',
  'What evidence exists today?',
  'Do students and teachers actually want this?',
  'What research supports reflection?',
  'What research warns about AI companionship?',
  'What would a pilot measure?',
  'What would make the team stop or change direction?',
  'How will feedback affect the design?',
] as const

const REVIEW_DATE = /^\d{4}-\d{2}-\d{2}$/
const words = (value: string) => value.trim().split(/\s+/).filter(Boolean)
const normalize = (value: string) => value.trim().toLocaleLowerCase('en')

describe('My World FAQ content registry', () => {
  it('pins the closed evidence, ledger, and concern taxonomies', () => {
    expect(FAQ_EVIDENCE_LABELS).toEqual([
      'Product fact',
      'Research-backed',
      'Early field signal · team verify',
      'Open question · pilot',
      'Team check',
    ])
    expect(FAQ_GUARDRAIL_STATES).toEqual([
      'built-today',
      'required-before-pilot',
      'still-researching',
    ])
    expect(FAQ_CONCERN_CLUSTERS.map((cluster) => cluster.id)).toEqual([
      'what-is-my-world',
      'human-connection',
      'attention-screen-time-motivation',
      'ai-safety-student-agency',
      'privacy-governance',
      'evidence-next-decision',
    ])
  })

  it('covers each committed question once through an explicit canonical mapping', () => {
    expect(FAQ_COMMITTED_QUESTION_TAXONOMY).toEqual(EXPECTED_COMMITTED_QUESTIONS)

    const mapped = FAQ_QUESTIONS.flatMap((question) => question.committedQuestions)
    expect(mapped).toHaveLength(EXPECTED_COMMITTED_QUESTIONS.length)
    expect(new Set(mapped).size).toBe(mapped.length)
    expect(new Set(mapped)).toEqual(new Set(EXPECTED_COMMITTED_QUESTIONS))

    for (const committedQuestion of EXPECTED_COMMITTED_QUESTIONS) {
      const matches = FAQ_QUESTIONS.filter((question) =>
        (question.committedQuestions as readonly string[]).includes(committedQuestion),
      )
      expect(matches, committedQuestion).toHaveLength(1)
      expect(resolveFaqQuestion(committedQuestion)?.id).toBe(matches[0]?.id)
    }
  })

  it('uses stable unique IDs, slugs, aliases, and authored order', () => {
    const ids = FAQ_QUESTIONS.map((question) => question.id)
    const slugs = FAQ_QUESTIONS.map((question) => question.slug)
    const aliases = FAQ_QUESTIONS.flatMap((question) => [
      question.title,
      ...question.committedQuestions,
      ...question.searchAliases,
    ]).map(normalize)
    const order = FAQ_QUESTIONS.map((question) => question.order)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(aliases).size).toBe(aliases.length)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(new Set(order).size).toBe(order.length)

    for (const question of FAQ_QUESTIONS) {
      expect(question.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(question.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(FAQ_CONCERN_CLUSTERS.some((cluster) => cluster.id === question.clusterId)).toBe(true)
      expect(words(question.shortAnswer).length, question.id).toBeGreaterThanOrEqual(20)
      expect(words(question.shortAnswer).length, question.id).toBeLessThanOrEqual(45)
      expect(question.blocks.length, question.id).toBeGreaterThan(0)
      expect(question.review.lastReviewed).toMatch(REVIEW_DATE)
      expect(question.review.reviewerRole.length).toBeGreaterThan(0)
      expect(question.review.status.length).toBeGreaterThan(0)
    }
  })

  it('makes every factual block auditable and resolves all references', () => {
    const sourceIds = new Set<string>(FAQ_SOURCES.map((source) => source.id))
    const provenanceIds = new Set<string>(FAQ_PRODUCT_PROVENANCE.map((item) => item.id))
    const guardrailIds = new Set<string>(FAQ_GUARDRAILS.map((item) => item.id))
    const assetIds = new Set<string>(
      (FAQ_ASSETS as readonly { id: string }[]).map((asset) => asset.id),
    )

    expect(sourceIds.size).toBe(FAQ_SOURCES.length)
    expect(provenanceIds.size).toBe(FAQ_PRODUCT_PROVENANCE.length)
    expect(guardrailIds.size).toBe(FAQ_GUARDRAILS.length)
    expect(assetIds.size).toBe(FAQ_ASSETS.length)

    const reverseLinkMismatches: string[] = []
    for (const question of FAQ_QUESTIONS) {
      for (const guardrailId of question.guardrailIds) {
        expect(guardrailIds.has(guardrailId), `${question.id} -> ${guardrailId}`).toBe(true)
        const guardrail = FAQ_GUARDRAILS.find((item) => item.id === guardrailId)
        if (!(guardrail?.questionIds as readonly string[] | undefined)?.includes(question.id)) {
          reverseLinkMismatches.push(`${guardrailId} -> ${question.id}`)
        }
      }
      for (const assetId of question.assetIds) {
        expect(assetIds.has(assetId), `${question.id} -> ${assetId}`).toBe(true)
      }

      for (const block of question.blocks) {
        expect(FAQ_EVIDENCE_LABELS).toContain(block.label)
        expect(block.text.trim().length, block.id).toBeGreaterThan(0)
        expect(block.populationContext.trim().length, block.id).toBeGreaterThan(0)
        expect(block.fit.trim().length, block.id).toBeGreaterThan(0)
        expect(block.limitations.trim().length, block.id).toBeGreaterThan(0)
        expect(block.review.reviewerRole.trim().length, block.id).toBeGreaterThan(0)
        expect(block.review.status.trim().length, block.id).toBeGreaterThan(0)
        expect(block.review.lastReviewed, block.id).toMatch(REVIEW_DATE)
        expect(
          block.sourceIds.length + block.provenanceIds.length,
          `${block.id} needs source or product provenance`,
        ).toBeGreaterThan(0)

        for (const sourceId of block.sourceIds) {
          expect(sourceIds.has(sourceId), `${block.id} -> ${sourceId}`).toBe(true)
        }
        for (const provenanceId of block.provenanceIds) {
          expect(provenanceIds.has(provenanceId), `${block.id} -> ${provenanceId}`).toBe(true)
        }
        for (const guardrailId of block.guardrailIds) {
          expect(guardrailIds.has(guardrailId), `${block.id} -> ${guardrailId}`).toBe(true)
        }

        if (block.label === 'Research-backed') {
          expect(block.sourceIds.length, block.id).toBeGreaterThan(0)
          expect(block.review.status, block.id).toBe('source-reviewed')
        }
        if (block.label === 'Product fact') {
          expect(block.provenanceIds.length, block.id).toBeGreaterThan(0)
          expect(block.review.status, block.id).toBe('repo-verified')
        }
        if (block.label === 'Early field signal · team verify') {
          expect(block.review.status, block.id).toBe('team-verification-required')
        }
        if (block.label === 'Open question · pilot') {
          expect(block.review.status, block.id).toBe('pilot-required')
        }
        if (block.label === 'Team check') {
          expect(block.review.status, block.id).toBe('team-check-required')
        }
      }
    }
    expect(reverseLinkMismatches).toEqual([])
  })

  it('keeps external source fit and limitations beside stable primary or official metadata', () => {
    for (const source of FAQ_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//)
      expect(source.title.trim().length).toBeGreaterThan(0)
      expect(source.publisher.trim().length).toBeGreaterThan(0)
      expect(source.published.trim().length).toBeGreaterThan(0)
      expect(source.populationContext.trim().length).toBeGreaterThan(0)
      expect(source.method.trim().length).toBeGreaterThan(0)
      expect(source.fit.trim().length).toBeGreaterThan(0)
      expect(source.limitations.trim().length).toBeGreaterThan(0)
      expect(source.lastChecked).toMatch(REVIEW_DATE)
      expect([
        'official-guidance',
        'official-policy',
        'evidence-review',
        'systematic-review',
        'meta-analysis',
        'primary-study',
        'working-paper',
      ]).toContain(source.kind)
    }
  })

  it('keeps every ledger item in one honest state with provenance and answer links', () => {
    expect(new Set(FAQ_GUARDRAILS.map((item) => item.state))).toEqual(new Set(FAQ_GUARDRAIL_STATES))

    const questionIds = new Set(FAQ_QUESTIONS.map((question) => question.id))
    const sourceIds = new Set(FAQ_SOURCES.map((source) => source.id))
    const provenanceIds = new Set(FAQ_PRODUCT_PROVENANCE.map((item) => item.id))
    for (const item of FAQ_GUARDRAILS) {
      expect(FAQ_GUARDRAIL_STATES).toContain(item.state)
      expect(item.protects.trim().length).toBeGreaterThan(0)
      expect(item.statusSummary.trim().length).toBeGreaterThan(0)
      expect(item.populationContext.trim().length).toBeGreaterThan(0)
      expect(item.fit.trim().length).toBeGreaterThan(0)
      expect(item.limitations.trim().length).toBeGreaterThan(0)
      expect(item.review.lastReviewed).toMatch(REVIEW_DATE)
      expect(item.questionIds.length, item.id).toBeGreaterThan(0)
      for (const questionId of item.questionIds) {
        expect(questionIds.has(questionId), `${item.id} -> ${questionId}`).toBe(true)
      }
      for (const sourceId of item.sourceIds) {
        expect(sourceIds.has(sourceId), `${item.id} -> ${sourceId}`).toBe(true)
      }
      for (const provenanceId of item.provenanceIds) {
        expect(provenanceIds.has(provenanceId), `${item.id} -> ${provenanceId}`).toBe(true)
      }
      if (item.state === 'built-today') {
        expect(item.label, item.id).toBe('Product fact')
        expect(item.provenanceIds.length, item.id).toBeGreaterThan(0)
        for (const provenanceId of item.provenanceIds) {
          expect(provenanceIds.has(provenanceId), `${item.id} -> ${provenanceId}`).toBe(true)
        }
        expect(item.review.status, item.id).toBe('repo-verified')
      }
    }
  })

  it('pins the dinner-table, adult-study, addiction, privacy, and early-signal calibrations', () => {
    const dinnerTable = resolveFaqQuestion('Are we replacing the dinner table?')
    expect(dinnerTable).toBeDefined()
    expect(dinnerTable?.blocks.some((block) => block.label === 'Product fact')).toBe(true)
    expect(dinnerTable?.blocks.some((block) => block.label === 'Research-backed')).toBe(true)
    expect(dinnerTable?.blocks.some((block) => block.label === 'Open question · pilot')).toBe(true)
    expect(
      dinnerTable?.blocks.some((block) =>
        /displacement|family conversation|human relationship/i.test(block.text),
      ),
    ).toBe(true)

    const adultRiskBlocks = FAQ_QUESTIONS.flatMap((question) => question.blocks).filter((block) =>
      block.sourceIds.includes('mit-stanford-adult-chatbot-rct-2025'),
    )
    expect(adultRiskBlocks.length).toBeGreaterThan(0)
    for (const block of adultRiskBlocks) {
      expect(`${block.populationContext} ${block.limitations}`).toMatch(/adult/i)
      expect(`${block.fit} ${block.limitations}`).toMatch(
        /risk signal|not evidence|cannot establish|does not establish/i,
      )
      expect(`${block.populationContext} ${block.limitations}`).toMatch(
        /Singapore secondary students/i,
      )
    }

    const addiction = resolveFaqQuestion('Is it addictive?')
    expect(addiction).toBeDefined()
    expect(
      `${addiction?.shortAnswer} ${addiction?.blocks.map((block) => block.text).join(' ')}`,
    ).not.toMatch(/(?:is|are|will be|guaranteed) non-addictive/i)
    expect(addiction?.blocks.some((block) => block.label === 'Open question · pilot')).toBe(true)

    const provider = resolveFaqQuestion('Do model providers train on student data?')
    expect(provider).toBeDefined()
    const providerText = provider?.blocks
      .filter((block) => block.label === 'Team check')
      .map((block) => `${block.text} ${block.limitations}`)
      .join(' ')
    expect(providerText).toMatch(/training/i)
    expect(providerText).toMatch(/retention/i)
    expect(providerText).toMatch(/residency/i)
    expect(providerText).toMatch(/deletion/i)
    expect(providerText).toMatch(/access/i)

    const unsupportedSignal = /student engagement|teacher support|school field[- ]research/i
    for (const block of FAQ_QUESTIONS.flatMap((question) => question.blocks)) {
      if (unsupportedSignal.test(block.text)) {
        expect(block.label, block.id).toBe('Early field signal · team verify')
      }
    }
  })

  it('blocks prohibited positioning in accountable copy', () => {
    const accountableCopy = [
      ...FAQ_QUESTIONS.flatMap((question) => [
        question.title,
        question.shortAnswer,
        ...question.blocks.map((block) => block.text),
      ]),
      ...FAQ_GUARDRAILS.flatMap((item) => [item.title, item.statusSummary]),
    ].join(' ')

    expect(accountableCopy).not.toMatch(
      /\b(?:is|acts as|works as) (?:a )?(?:therapist|counsellor)\b/i,
    )
    expect(accountableCopy).not.toMatch(/\bproven (?:safe|effective)\b/i)
    expect(accountableCopy).not.toMatch(/\bguarantee(?:d|s)? (?:safety|non-addiction)\b/i)
    expect(accountableCopy).not.toMatch(/\b(?:MOE|schools?) (?:endorses?|approves?) My World\b/i)
  })
})
