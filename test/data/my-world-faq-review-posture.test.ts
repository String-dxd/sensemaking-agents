import { describe, expect, it } from 'vitest'
import { DEFAULT_MY_WORLD_FAQ_CONTENT } from '~/data/my-world-faq'
import {
  countOpenThreadKinds,
  isOpenQuestion,
  postureOfQuestion,
  postureOfStatus,
  tallyPosture,
} from '~/data/my-world-faq/review-posture'

/* The numbers on the page and the filter behind it come from here, so what is asserted is the
 * RELATIONSHIP between them rather than any particular count. A count would be an assertion
 * about the content, which changes every time somebody publishes a question — and a test that
 * goes red because the FAQ grew is a test people learn to re-run instead of read. */

describe('review posture', () => {
  it('treats only checked-against-something as settled', () => {
    expect(postureOfStatus('repo-verified')).toBe('settled')
    expect(postureOfStatus('source-reviewed')).toBe('settled')

    for (const status of [
      'team-verification-required',
      'pilot-required',
      'team-check-required',
      'draft-awaiting-human-review',
    ] as const) {
      expect(postureOfStatus(status), status).toBe('open')
    }
  })

  /* The rule the page's honesty rests on. A question whose own review is signed off but which
   * rests on a block nobody has verified is not settled, and counting it as settled would
   * overstate the evidence — on a page whose entire argument is that it does not do that. */
  it('is open if any evidence block under it is open, however settled the question looks', () => {
    const question = DEFAULT_MY_WORLD_FAQ_CONTENT.questions.find((item) =>
      item.blocks.some((block) => postureOfStatus(block.review.status) === 'open'),
    )
    expect(question, 'no question in the content rests on an open block').toBeDefined()
    if (!question) return

    const settledLooking = {
      ...question,
      review: { ...question.review, status: 'repo-verified' as const },
    }
    expect(postureOfQuestion(settledLooking)).toBe('open')
    expect(isOpenQuestion(settledLooking)).toBe(true)
  })

  it('is settled only when the question and every block under it are', () => {
    const question = DEFAULT_MY_WORLD_FAQ_CONTENT.questions[0]
    expect(question).toBeDefined()
    if (!question) return

    const allSettled = {
      ...question,
      review: { ...question.review, status: 'repo-verified' as const },
      blocks: question.blocks.map((block) => ({
        ...block,
        review: { ...block.review, status: 'source-reviewed' as const },
      })),
    }
    expect(postureOfQuestion(allSettled)).toBe('settled')
  })

  describe('the tally the page reads', () => {
    const tally = tallyPosture(DEFAULT_MY_WORLD_FAQ_CONTENT)

    /* Counted over BLOCKS, because that is where the review statuses carry information. The
       first version counted questions and reported "0 settled, 34 open" on real content, since
       every question shares one not-yet-reviewed status. These assertions pin the arithmetic
       rather than the values, so publishing a question cannot turn them red. */
    it('splits every evidence block into checked or still open', () => {
      const blocks = DEFAULT_MY_WORLD_FAQ_CONTENT.questions.flatMap((question) => question.blocks)
      expect(tally.blocks).toBe(blocks.length)
      expect(tally.checked + tally.openThreads).toBe(tally.blocks)
      expect(tally.checked).toBe(
        blocks.filter((block) => postureOfStatus(block.review.status) === 'settled').length,
      )
    })

    it('counts questions separately from the evidence under them', () => {
      expect(tally.questions).toBe(DEFAULT_MY_WORLD_FAQ_CONTENT.questions.length)
      expect(tally.blocks).toBeGreaterThan(tally.questions)
    })

    it('counts distinct cited sources, not citations', () => {
      const citations = DEFAULT_MY_WORLD_FAQ_CONTENT.questions.flatMap((question) =>
        question.blocks.flatMap((block) => block.sourceIds),
      )
      expect(tally.sources).toBe(new Set(citations).size)
      expect(tally.sources).toBeLessThanOrEqual(citations.length)
    })

    it('reports the most recent review date, not the oldest', () => {
      const dates = DEFAULT_MY_WORLD_FAQ_CONTENT.questions.flatMap((question) => [
        question.review.lastReviewed,
        ...question.blocks.map((block) => block.review.lastReviewed),
      ])
      expect(tally.lastReviewed).toBe(dates.slice().sort().at(-1))
    })

    it('says something rather than nothing about a document with no questions', () => {
      const empty = tallyPosture({ ...DEFAULT_MY_WORLD_FAQ_CONTENT, questions: [] })
      expect(empty).toMatchObject({
        questions: 0,
        blocks: 0,
        checked: 0,
        openThreads: 0,
        sources: 0,
        lastReviewed: null,
      })
    })
  })

  /* The axis that DOES discriminate on this content, and the reason the reader-facing filter has
     to use it: a settled/open split over questions matches all of them. */
  describe('what an open answer is waiting for', () => {
    it('splits the open blocks into kinds that each match something', () => {
      const kinds = countOpenThreadKinds(DEFAULT_MY_WORLD_FAQ_CONTENT)
      const tally = tallyPosture(DEFAULT_MY_WORLD_FAQ_CONTENT)

      expect(kinds.length).toBeGreaterThan(1)
      for (const kind of kinds) expect(kind.count, kind.label).toBeGreaterThan(0)
      expect(kinds.reduce((sum, kind) => sum + kind.count, 0)).toBe(tally.openThreads)
    })

    it('drops a kind nothing is waiting on rather than showing a zero', () => {
      const kinds = countOpenThreadKinds({
        ...DEFAULT_MY_WORLD_FAQ_CONTENT,
        questions: [],
      })
      expect(kinds).toEqual([])
    })
  })
})
