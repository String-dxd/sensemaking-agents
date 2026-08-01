import { describe, expect, it } from 'vitest'
import {
  canonicalizeMyWorldFaqDocument,
  composeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_DOCUMENT,
  digestMyWorldFaqDocument,
  FAQ_EDITABLE_FIELDS,
  validateMyWorldFaqDocument,
} from '~/data/my-world-faq'

function cloneDefault(): unknown {
  return structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
}

function first<T>(items: T[]): T {
  const value = items[0]
  if (!value) throw new Error('Expected a seeded FAQ record')
  return value
}

describe('My World FAQ publication contract', () => {
  it('validates and composes the compiled document without changing public structure', async () => {
    const validation = validateMyWorldFaqDocument(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    expect(validation.success).toBe(true)
    if (!validation.success) return

    const content = composeMyWorldFaqDocument(validation.document)
    expect(content.questions).toHaveLength(34)
    expect(content.questions.flatMap((question) => question.committedQuestions)).toHaveLength(40)
    expect(content.productSteps).toHaveLength(4)
    expect(content.signalQuotes).toHaveLength(5)
    expect(content.guardrails).toHaveLength(22)
    expect(content.questions.flatMap((question) => question.blocks)).toHaveLength(92)

    const canonical = canonicalizeMyWorldFaqDocument(validation.document)
    expect(canonical).toBe(canonicalizeMyWorldFaqDocument(JSON.parse(canonical)))
    expect(await digestMyWorldFaqDocument(validation.document)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('publishes a deterministic, unique editable field manifest', () => {
    const paths = FAQ_EDITABLE_FIELDS.map((field) => field.path)
    expect(paths.length).toBeGreaterThan(400)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths).toContain('route.title')
    expect(paths).toContain('page.hero.introduction')
    expect(paths).toContain('page.build.backstageIntroduction')
    expect(paths).toContain('page.build.quietHoursBody')
    expect(paths).toContain('page.why.heading')
    expect(paths).toContain('questions.reflection-problem.displayedQuestion')
    expect(paths).toContain('sources.moe-ai-education-2025.url')
    expect(paths).not.toContain('questions.reflection-problem.slug')
  })

  it('keeps historical documents without optional narrative copy canonically unchanged', async () => {
    const historical = structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    delete historical.page.build
    delete historical.page.why
    delete historical.page.posture
    const before = JSON.stringify(historical)

    const validation = validateMyWorldFaqDocument(historical)

    expect(validation.success).toBe(true)
    expect(canonicalizeMyWorldFaqDocument(historical)).toBe(before)
    expect(JSON.parse(canonicalizeMyWorldFaqDocument(historical)).page).not.toHaveProperty('build')
    expect(JSON.parse(canonicalizeMyWorldFaqDocument(historical)).page).not.toHaveProperty('why')
    expect(JSON.parse(canonicalizeMyWorldFaqDocument(historical)).page).not.toHaveProperty(
      'posture',
    )
    expect(await digestMyWorldFaqDocument(historical)).toBe(
      'fcabc6ff5e308e890806f02064071cb1440668b7319923b96e8d84b7159cf6b9',
    )
  })

  it('rejects unknown shape, structural reordering, locked-field edits, and unsafe links', () => {
    const extra = cloneDefault() as Record<string, unknown>
    extra.unexpected = true
    expect(validateMyWorldFaqDocument(extra).success).toBe(false)

    const reordered = cloneDefault() as typeof DEFAULT_MY_WORLD_FAQ_DOCUMENT
    reordered.questions = [...reordered.questions].reverse()
    expect(validateMyWorldFaqDocument(reordered).success).toBe(false)

    const locked = cloneDefault() as typeof DEFAULT_MY_WORLD_FAQ_DOCUMENT
    locked.questions[0] = { ...first(locked.questions), slug: 'changed' }
    expect(validateMyWorldFaqDocument(locked).success).toBe(false)

    const unsafe = cloneDefault() as typeof DEFAULT_MY_WORLD_FAQ_DOCUMENT
    unsafe.sources[0] = { ...first(unsafe.sources), url: 'javascript:alert(1)' }
    expect(validateMyWorldFaqDocument(unsafe).success).toBe(false)
  })

  it('reports field limits and prohibited claims as stable field-path errors', () => {
    const short = cloneDefault() as typeof DEFAULT_MY_WORLD_FAQ_DOCUMENT
    short.questions[0] = { ...first(short.questions), shortAnswer: 'Too short.' }
    const shortResult = validateMyWorldFaqDocument(short)
    expect(shortResult.success).toBe(false)
    if (!shortResult.success) {
      expect(shortResult.errors).toContainEqual(
        expect.objectContaining({
          path: 'questions.reflection-problem.shortAnswer',
          code: 'word_count',
        }),
      )
    }

    const claim = cloneDefault() as typeof DEFAULT_MY_WORLD_FAQ_DOCUMENT
    claim.guardrails[0] = {
      ...first(claim.guardrails),
      statusSummary: 'My World is a therapist and is proven safe.',
    }
    const claimResult = validateMyWorldFaqDocument(claim)
    expect(claimResult.success).toBe(false)
    if (!claimResult.success) {
      expect(claimResult.errors).toContainEqual(
        expect.objectContaining({
          path: `guardrails.${claim.guardrails[0]?.id}.statusSummary`,
          code: 'prohibited_claim',
        }),
      )
    }
  })
})
