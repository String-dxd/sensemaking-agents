import { describe, expect, it } from 'vitest'
import {
  compareMyWorldFaqEditorialVersions,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  type MyWorldFaqEditorialDocument,
  prepareMyWorldFaqEditorialIntent,
  prepareMyWorldFaqEditorialMutation,
  readMyWorldFaqManifestPath,
  setMyWorldFaqManifestPath,
  stampMyWorldFaqEditorialIntent,
} from '~/data/my-world-faq'

function defaultDocument(): MyWorldFaqEditorialDocument {
  return structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
}

function comparisonAt(
  comparisons: ReturnType<typeof compareMyWorldFaqEditorialVersions>,
  path: string,
) {
  const comparison = comparisons.find((item) => item.path === path)
  if (!comparison) throw new Error(`Expected comparison for ${path}`)
  return comparison
}

describe('My World FAQ editorial mutation helpers', () => {
  it('reads and immutably sets stable record, state, and numeric author paths', () => {
    const base = defaultDocument()
    const question = base.questions[0]
    const block = question?.blocks[0]
    const source = base.sources[0]
    const ledger = base.ledgerPreview[0]
    if (!question || !block || !source || !ledger) throw new Error('Expected seeded records')

    const questionPath = `questions.${question.id}.blocks.${block.id}.heading`
    const sourceAuthorPath = `sources.${source.id}.authors.0`
    const ledgerPath = `ledgerPreview.${ledger.state}.description`

    expect(readMyWorldFaqManifestPath(base, questionPath)).toBe(block.heading)
    expect(readMyWorldFaqManifestPath(base, sourceAuthorPath)).toBe(source.authors[0])
    expect(readMyWorldFaqManifestPath(base, ledgerPath)).toBe(ledger.description)

    const withQuestion = setMyWorldFaqManifestPath(base, questionPath, 'A revised heading')
    const withAuthor = setMyWorldFaqManifestPath(withQuestion, sourceAuthorPath, 'A. Researcher')
    const updated = setMyWorldFaqManifestPath(withAuthor, ledgerPath, 'A revised description')

    expect(readMyWorldFaqManifestPath(updated, questionPath)).toBe('A revised heading')
    expect(readMyWorldFaqManifestPath(updated, sourceAuthorPath)).toBe('A. Researcher')
    expect(readMyWorldFaqManifestPath(updated, ledgerPath)).toBe('A revised description')
    expect(readMyWorldFaqManifestPath(base, questionPath)).toBe(block.heading)
    expect(readMyWorldFaqManifestPath(base, sourceAuthorPath)).toBe(source.authors[0])
    expect(readMyWorldFaqManifestPath(base, ledgerPath)).toBe(ledger.description)
    expect(() => readMyWorldFaqManifestPath(base, `questions.${question.id}.slug`)).toThrow(
      'Unknown My World FAQ editable path',
    )
  })

  it('rebuilds from the authoritative base and stamps only changed accountable records', () => {
    const base = defaultDocument()
    const question = base.questions[0]
    const block = question?.blocks[0]
    const source = base.sources[0]
    const provenance = base.productProvenance[0]
    const guardrail = base.guardrails[0]
    const asset = base.assets[0]
    if (!question || !block || !source || !provenance || !guardrail || !asset) {
      throw new Error('Expected seeded records')
    }

    const paths = {
      page: 'page.hero.heading',
      question: `questions.${question.id}.displayedQuestion`,
      shortAnswer: `questions.${question.id}.shortAnswer`,
      block: `questions.${question.id}.blocks.${block.id}.heading`,
      source: `sources.${source.id}.title`,
      provenance: `productProvenance.${provenance.id}.title`,
      guardrail: `guardrails.${guardrail.id}.title`,
      asset: `assets.${asset.id}.alt`,
    } as const

    let submitted = setMyWorldFaqManifestPath(base, paths.page, `${base.page.hero.heading}?`)
    submitted = setMyWorldFaqManifestPath(
      submitted,
      paths.question,
      `${question.displayedQuestion}?`,
    )
    submitted = setMyWorldFaqManifestPath(
      submitted,
      paths.shortAnswer,
      question.shortAnswer.replace(' ', ', '),
    )
    submitted = setMyWorldFaqManifestPath(submitted, paths.block, `${block.heading} — reviewed`)
    submitted = setMyWorldFaqManifestPath(submitted, paths.source, `${source.title} — reviewed`)
    submitted = setMyWorldFaqManifestPath(
      submitted,
      paths.provenance,
      `${provenance.title} — reviewed`,
    )
    submitted = setMyWorldFaqManifestPath(
      submitted,
      paths.guardrail,
      `${guardrail.title} — reviewed`,
    )
    submitted = setMyWorldFaqManifestPath(submitted, paths.asset, `${asset.alt} Reviewed.`)

    const result = prepareMyWorldFaqEditorialMutation({
      base,
      submitted,
      reviewDate: '2026-08-01',
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.dirtyPaths).toEqual(Object.values(paths))
    expect(result.stampTargets).toEqual([
      `questions.${question.id}.review.lastReviewed`,
      `questions.${question.id}.blocks.${block.id}.review.lastReviewed`,
      `sources.${source.id}.lastChecked`,
      `productProvenance.${provenance.id}.lastChecked`,
      `guardrails.${guardrail.id}.review.lastReviewed`,
      `assets.${asset.id}.lastReviewed`,
    ])
    expect(result.document.questions[0]?.review.lastReviewed).toBe('2026-08-01')
    expect(result.document.questions[0]?.blocks[0]?.review.lastReviewed).toBe('2026-08-01')
    expect(result.document.sources[0]?.lastChecked).toBe('2026-08-01')
    expect(result.document.productProvenance[0]?.lastChecked).toBe('2026-08-01')
    expect(result.document.guardrails[0]?.review.lastReviewed).toBe('2026-08-01')
    expect(result.document.assets[0]?.lastReviewed).toBe('2026-08-01')
    expect(result.intentDocument.questions[0]?.review.lastReviewed).toBe(
      base.questions[0]?.review.lastReviewed,
    )
    expect(result.intentDocument.sources[0]?.lastChecked).toBe(base.sources[0]?.lastChecked)
    expect(result.document.questions[1]?.review.lastReviewed).toBe(
      base.questions[1]?.review.lastReviewed,
    )
    expect(result.document.sources[1]?.lastChecked).toBe(base.sources[1]?.lastChecked)
  })

  it('rejects stable-path changes outside the editable manifest', () => {
    const base = defaultDocument()
    const question = base.questions[0]
    if (!question) throw new Error('Expected a seeded question')

    const changedStructure = structuredClone(base)
    changedStructure.questions[0] = { ...question, slug: 'changed-by-editor' }
    const structureResult = prepareMyWorldFaqEditorialMutation({
      base,
      submitted: changedStructure,
      reviewDate: '2026-08-01',
    })

    expect(structureResult).toMatchObject({
      success: false,
      reason: 'non_editable_change',
      issues: [
        {
          path: `questions.${question.id}.slug`,
          code: 'non_editable_change',
        },
      ],
    })

    const changedReviewDate = structuredClone(base)
    changedReviewDate.questions[0] = {
      ...question,
      review: { ...question.review, lastReviewed: '2026-08-01' },
    }
    const reviewResult = prepareMyWorldFaqEditorialMutation({
      base,
      submitted: changedReviewDate,
      reviewDate: '2026-08-01',
    })

    expect(reviewResult).toMatchObject({
      success: false,
      reason: 'non_editable_change',
      issues: [
        {
          path: `questions.${question.id}.review.lastReviewed`,
          code: 'non_editable_change',
        },
      ],
    })

    const changedId = structuredClone(base)
    changedId.questions[0] = { ...question, id: 'changed-by-editor' }
    const idResult = prepareMyWorldFaqEditorialMutation({
      base,
      submitted: changedId,
      reviewDate: '2026-08-01',
    })
    expect(idResult).toMatchObject({
      success: false,
      reason: 'non_editable_change',
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: 'questions',
          code: 'non_editable_change',
        }),
      ]),
    })
  })

  it('rejects no-op and invalid editable submissions without stamping', () => {
    const base = defaultDocument()
    const question = base.questions[0]
    if (!question) throw new Error('Expected a seeded question')

    expect(
      prepareMyWorldFaqEditorialMutation({
        base,
        submitted: structuredClone(base),
        reviewDate: '2026-08-01',
      }),
    ).toMatchObject({
      success: false,
      reason: 'no_op',
      issues: [{ path: '', code: 'no_op' }],
    })

    const invalid = setMyWorldFaqManifestPath(
      base,
      `questions.${question.id}.shortAnswer`,
      'Too short.',
    )
    const invalidResult = prepareMyWorldFaqEditorialMutation({
      base,
      submitted: invalid,
      reviewDate: '2026-08-01',
    })

    expect(invalidResult).toMatchObject({
      success: false,
      reason: 'invalid_candidate',
      issues: [
        expect.objectContaining({
          path: `questions.${question.id}.shortAnswer`,
          code: 'word_count',
        }),
      ],
    })
    if (!invalidResult.success) {
      expect(invalidResult.issues).not.toContainEqual(
        expect.objectContaining({ path: `questions.${question.id}.review.lastReviewed` }),
      )
    }

    const malformed = structuredClone(base) as unknown as {
      questions: Array<Record<string, unknown>>
    }
    if (!malformed.questions[0]) throw new Error('Expected a seeded question')
    malformed.questions[0].shortAnswer = 42
    expect(() =>
      prepareMyWorldFaqEditorialMutation({
        base,
        submitted: malformed,
        reviewDate: '2026-08-01',
      }),
    ).not.toThrow()
    expect(
      prepareMyWorldFaqEditorialMutation({
        base,
        submitted: malformed,
        reviewDate: '2026-08-01',
      }),
    ).toMatchObject({
      success: false,
      reason: 'invalid_candidate',
      issues: [
        expect.objectContaining({
          path: `questions.${question.id}.shortAnswer`,
          code: 'schema',
        }),
      ],
    })

    const missing = structuredClone(base) as unknown as {
      route: Record<string, unknown>
    }
    delete missing.route.title
    expect(
      prepareMyWorldFaqEditorialMutation({
        base,
        submitted: missing,
        reviewDate: '2026-08-01',
      }),
    ).toMatchObject({
      success: false,
      reason: 'invalid_candidate',
      issues: [
        expect.objectContaining({
          path: 'route.title',
          code: 'schema',
        }),
      ],
    })
  })

  it('does not stamp page, route, product, quote, cluster, or ledger wording', () => {
    const base = defaultDocument()
    const product = base.productSteps[0]
    const quote = base.signalQuotes[0]
    const cluster = base.concernClusters[0]
    const ledger = base.ledgerPreview[0]
    if (!product || !quote || !cluster || !ledger) throw new Error('Expected seeded records')

    const changes = [
      ['route.title', `${base.route.title} — revised`],
      ['page.hero.heading', `${base.page.hero.heading} — revised`],
      [`productSteps.${product.id}.title`, `${product.title} — revised`],
      [`signalQuotes.${quote.id}.text`, `${quote.text} Revised.`],
      [`concernClusters.${cluster.id}.label`, `${cluster.label} — revised`],
      [`ledgerPreview.${ledger.state}.description`, `${ledger.description} Revised.`],
    ] as const

    let submitted = base
    for (const [path, value] of changes) {
      submitted = setMyWorldFaqManifestPath(submitted, path, value)
    }

    const result = prepareMyWorldFaqEditorialMutation({
      base,
      submitted,
      reviewDate: '2026-08-01',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(new Set(result.dirtyPaths)).toEqual(new Set(changes.map(([path]) => path)))
    expect(result.stampTargets).toEqual([])
    expect(result.document).toEqual(result.intentDocument)
  })

  it('keeps the unstamped intent stable when the database review date changes', () => {
    const base = defaultDocument()
    const question = base.questions[0]
    if (!question) throw new Error('Expected a seeded question')
    const path = `questions.${question.id}.displayedQuestion`
    const submitted = setMyWorldFaqManifestPath(
      base,
      path,
      `${question.displayedQuestion} Please tell us what you think.`,
    )
    const intent = prepareMyWorldFaqEditorialIntent({ base, submitted })
    expect(intent.success).toBe(true)
    if (!intent.success) return

    const first = stampMyWorldFaqEditorialIntent({
      intentDocument: intent.intentDocument,
      dirtyPaths: intent.dirtyPaths,
      reviewDate: '2026-08-01',
    })
    const second = stampMyWorldFaqEditorialIntent({
      intentDocument: intent.intentDocument,
      dirtyPaths: intent.dirtyPaths,
      reviewDate: '2026-08-02',
    })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    if (!first.success || !second.success) return
    expect(first.intentDocument).toEqual(second.intentDocument)
    expect(first.document.questions[0]?.review.lastReviewed).toBe('2026-08-01')
    expect(second.document.questions[0]?.review.lastReviewed).toBe('2026-08-02')
  })

  it('classifies every manifest path in a three-way comparison', () => {
    const base = defaultDocument()
    const localOnlyPath = 'route.title'
    const remoteOnlyPath = 'route.description'
    const convergedPath = 'page.hero.heading'
    const overlapPath = 'page.hero.introduction'
    const unchangedPath = 'page.hero.eyebrow'

    let local = setMyWorldFaqManifestPath(base, localOnlyPath, 'Local title')
    local = setMyWorldFaqManifestPath(local, convergedPath, 'Shared heading')
    local = setMyWorldFaqManifestPath(local, overlapPath, 'Local introduction')

    let latest = setMyWorldFaqManifestPath(base, remoteOnlyPath, 'Remote description')
    latest = setMyWorldFaqManifestPath(latest, convergedPath, 'Shared heading')
    latest = setMyWorldFaqManifestPath(latest, overlapPath, 'Remote introduction')

    const comparisons = compareMyWorldFaqEditorialVersions(base, local, latest)

    expect(comparisonAt(comparisons, unchangedPath).status).toBe('unchanged')
    expect(comparisonAt(comparisons, localOnlyPath)).toMatchObject({
      status: 'local-only',
      localValue: 'Local title',
    })
    expect(comparisonAt(comparisons, remoteOnlyPath)).toMatchObject({
      status: 'remote-only',
      latestValue: 'Remote description',
    })
    expect(comparisonAt(comparisons, convergedPath)).toMatchObject({
      status: 'converged',
      localValue: 'Shared heading',
      latestValue: 'Shared heading',
    })
    expect(comparisonAt(comparisons, overlapPath)).toMatchObject({
      status: 'overlap',
      localValue: 'Local introduction',
      latestValue: 'Remote introduction',
    })
  })
})
