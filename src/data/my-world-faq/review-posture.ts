/* What counts as settled and what counts as open, defined once.
 *
 * Two things read this and they must never disagree: the "Where this is up to" section, which
 * tells a reader how much of the page rests on what, and the FAQ's own filter, which shows
 * them only the open ones. A reader who is told "11 still open" and then filters to a list of
 * nine has been given a reason to distrust every other number on the page — and that page is
 * about a product whose whole pitch is that it will not overstate what it knows.
 *
 * The classification is a JUDGEMENT about each review status, not a property of it, which is
 * why it lives here rather than next to the statuses in content-schema.ts. `repo-verified` and
 * `source-reviewed` mean somebody checked the claim against a thing that exists. Every other
 * status means the answer is still owed to somebody. */

import type { MyWorldFaqContent, MyWorldFaqQuestion } from './content-schema'

export type ReviewPosture = 'settled' | 'open'

/* Exhaustive over the review statuses on purpose: a new status added to content-schema.ts with
 * no entry here is a TypeScript error rather than a question that quietly counts as settled. */
const POSTURE_BY_STATUS = {
  'repo-verified': 'settled',
  'source-reviewed': 'settled',
  'team-verification-required': 'open',
  'pilot-required': 'open',
  'team-check-required': 'open',
  'draft-awaiting-human-review': 'open',
} as const satisfies Record<MyWorldFaqQuestion['review']['status'], ReviewPosture>

export function postureOfStatus(status: MyWorldFaqQuestion['review']['status']): ReviewPosture {
  return POSTURE_BY_STATUS[status]
}

/* A question is open if ITS OWN review is open, or if any evidence block under it is. A
 * question whose headline answer is checked but which rests on a block nobody has verified is
 * not settled, and calling it settled is the exact overstatement this page exists to avoid. */
export function postureOfQuestion(question: MyWorldFaqQuestion): ReviewPosture {
  if (postureOfStatus(question.review.status) === 'open') return 'open'
  return question.blocks.some((block) => postureOfStatus(block.review.status) === 'open')
    ? 'open'
    : 'settled'
}

export function isOpenQuestion(question: MyWorldFaqQuestion): boolean {
  return postureOfQuestion(question) === 'open'
}

export interface PostureTally {
  /** Questions answered on the page. */
  questions: number
  /** Evidence blocks under them — where the review statuses actually live. */
  blocks: number
  /** Blocks checked against the prototype or a source. */
  checked: number
  /** Blocks still waiting on a pilot, a legal check or team verification. */
  openThreads: number
  /** Distinct sources cited, so "evidence" is a count of real things. */
  sources: number
  /** Audience quotes the page was shaped by. */
  signals: number
  /** The most recent review date anywhere in the document, ISO. */
  lastReviewed: string | null
}

/* COUNTED AT BLOCK LEVEL, and that is a correction rather than a preference. The first version
 * counted questions, and measuring the real content showed why that was useless: all 34
 * questions carry `draft-awaiting-human-review`, so a settled/open split over questions reads
 * "0 settled, 34 open" — which understates the work badly, since 49 of the 92 blocks beneath
 * them ARE checked against the prototype or a source.
 *
 * It also killed a feature. A reader-facing "show me only the open questions" filter over that
 * same split would have matched all 34 and filtered nothing. Anything built on this data has to
 * discriminate on blocks or on what a block is waiting FOR. */
export function tallyPosture(content: MyWorldFaqContent): PostureTally {
  const blocks = content.questions.flatMap((question) => question.blocks)
  const cited = new Set<string>()
  const dates: string[] = []

  for (const question of content.questions) dates.push(question.review.lastReviewed)
  for (const block of blocks) {
    dates.push(block.review.lastReviewed)
    for (const id of block.sourceIds) cited.add(id)
  }

  const checked = blocks.filter(
    (block) => postureOfStatus(block.review.status) === 'settled',
  ).length

  return {
    questions: content.questions.length,
    blocks: blocks.length,
    checked,
    openThreads: blocks.length - checked,
    sources: cited.size,
    signals: content.signalQuotes.length,
    /* Max rather than min: this answers "when did we last look at this", and the oldest date
     * would answer a different question. Sorted as strings, which is safe only because the
     * schema pins these to ISO dates — see `isoDate` in content-schema.ts. */
    lastReviewed: dates.length ? dates.slice().sort().at(-1)! : null,
  }
}

/* What an unresolved answer is waiting FOR — the split that does discriminate on this content:
 * 33 blocks need a pilot, 9 need a privacy or legal check, 1 needs team verification. This is
 * the axis a reader-facing filter should use. */
export const OPEN_THREAD_KINDS = [
  { status: 'pilot-required', label: 'Needs a pilot to answer' },
  { status: 'team-check-required', label: 'Needs a privacy or legal check' },
  { status: 'team-verification-required', label: 'Needs the team to verify' },
] as const satisfies ReadonlyArray<{
  status: MyWorldFaqQuestion['review']['status']
  label: string
}>

export function countOpenThreadKinds(content: MyWorldFaqContent) {
  const blocks = content.questions.flatMap((question) => question.blocks)
  return OPEN_THREAD_KINDS.map((kind) => ({
    ...kind,
    count: blocks.filter((block) => block.review.status === kind.status).length,
  })).filter((kind) => kind.count > 0)
}
