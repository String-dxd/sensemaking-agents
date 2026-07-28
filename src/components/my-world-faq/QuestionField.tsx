import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import {
  FAQ_CONCERN_CLUSTERS,
  FAQ_PRODUCT_PROVENANCE,
  FAQ_QUESTIONS,
  FAQ_SOURCES,
  type FaqConcernClusterId,
  type FaqEvidenceBlock,
  type FaqProductProvenance,
  type FaqQuestion,
  type FaqSource,
} from '~/data/my-world-faq'

const DEFAULT_QUESTION_ID = 'dinner-table'

const SOURCE_BY_ID: ReadonlyMap<string, FaqSource> = new Map(
  FAQ_SOURCES.map((source) => [source.id, source] as const),
)
const PROVENANCE_BY_ID: ReadonlyMap<string, FaqProductProvenance> = new Map(
  FAQ_PRODUCT_PROVENANCE.map((item) => [item.id, item] as const),
)

const REVIEW_STATUS_LABEL = {
  'repo-verified': 'Repository verified',
  'source-reviewed': 'Source reviewed',
  'team-verification-required': 'Team verification required',
  'pilot-required': 'Pilot required',
  'team-check-required': 'Team check required',
  'draft-awaiting-human-review': 'Draft awaiting human review',
} as const

type ClusterFilter = 'all' | FaqConcernClusterId

function searchText(question: FaqQuestion) {
  return [
    question.title,
    question.shortAnswer,
    ...question.committedQuestions,
    ...question.searchAliases,
  ]
    .join(' ')
    .toLocaleLowerCase('en')
}

export function QuestionField() {
  const [query, setQuery] = useState('')
  const [clusterFilter, setClusterFilter] = useState<ClusterFilter>('all')
  const [selectedQuestionId, setSelectedQuestionId] = useState(DEFAULT_QUESTION_ID)
  const answerTitleRef = useRef<HTMLHeadingElement | null>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase('en')

  const visibleQuestions = useMemo(
    () =>
      FAQ_QUESTIONS.filter(
        (question) =>
          (clusterFilter === 'all' || question.clusterId === clusterFilter) &&
          (!normalizedQuery || searchText(question).includes(normalizedQuery)),
      ),
    [clusterFilter, normalizedQuery],
  )

  useEffect(() => {
    if (visibleQuestions.length === 0) return
    if (!visibleQuestions.some((question) => question.id === selectedQuestionId)) {
      setSelectedQuestionId(visibleQuestions[0]?.id ?? DEFAULT_QUESTION_ID)
    }
  }, [selectedQuestionId, visibleQuestions])

  const selectedQuestion =
    visibleQuestions.find((question) => question.id === selectedQuestionId) ?? null

  function selectQuestion(questionId: string) {
    setSelectedQuestionId(questionId)
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      answerTitleRef.current?.focus({ preventScroll: true })
      answerTitleRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    })
  }

  return (
    <section
      id="signals"
      aria-labelledby="question-field-title"
      className="scroll-mt-6 border-b border-(--color-faq-line)"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="max-w-2xl lg:col-span-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-faq-ink-faint)">
              Signals → questions
            </p>
            <h2
              id="question-field-title"
              className="mt-3 text-[clamp(1.9rem,4vw,3.2rem)] font-semibold leading-tight tracking-[-0.045em]"
            >
              Inspect a concern without opening an essay wall
            </h2>
            <p className="mt-4 text-base leading-relaxed text-(--color-faq-ink-soft)">
              All 34 canonical answers—covering the 40 committed questions—remain visible by
              default. Select one for the team’s short answer, then open “How we know” for evidence,
              fit, limitations, and unsettled checks.
            </p>
          </div>
          <p className="text-sm leading-relaxed text-(--color-faq-ink-soft) lg:col-span-4">
            Individual event comments shaped this language. They do not establish how common a
            concern is or whether the product is desirable.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-semibold text-(--color-faq-ink-soft)">
            Search questions
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “privacy”, “dinner table”, or “Singlish”"
              className="min-h-11 rounded-xl border border-(--color-faq-line-strong) bg-(--color-faq-surface) px-3.5 text-sm font-normal text-(--color-faq-ink) outline-none placeholder:text-(--color-faq-ink-faint) focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold text-(--color-faq-ink-soft)">
            Concern cluster
            <select
              value={clusterFilter}
              onChange={(event) => setClusterFilter(event.target.value as ClusterFilter)}
              className="min-h-11 rounded-xl border border-(--color-faq-line-strong) bg-(--color-faq-surface) px-3.5 text-sm font-normal text-(--color-faq-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
            >
              <option value="all">All concerns</option>
              {FAQ_CONCERN_CLUSTERS.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex min-h-8 items-center justify-between gap-4 text-xs text-(--color-faq-ink-faint)">
          <p aria-live="polite">
            {visibleQuestions.length} {visibleQuestions.length === 1 ? 'question' : 'questions'}
          </p>
          {query || clusterFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setClusterFilter('all')
                setSelectedQuestionId(DEFAULT_QUESTION_ID)
              }}
              className="rounded-sm font-semibold text-(--color-faq-ink) underline decoration-(--color-faq-line-strong) underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
            >
              Reset filters
            </button>
          ) : null}
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] lg:items-start">
          <QuestionGroups
            visibleQuestions={visibleQuestions}
            selectedQuestionId={selectedQuestionId}
            onSelect={selectQuestion}
          />
          {selectedQuestion ? (
            <AnswerSurface
              key={selectedQuestion.id}
              question={selectedQuestion}
              titleRef={answerTitleRef}
            />
          ) : (
            <div
              role="status"
              className="rounded-2xl border border-dashed border-(--color-faq-line-strong) p-6 text-sm text-(--color-faq-ink-soft)"
            >
              No question matches both filters. Clear the search or reset the concern cluster.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function QuestionGroups({
  visibleQuestions,
  selectedQuestionId,
  onSelect,
}: {
  visibleQuestions: readonly FaqQuestion[]
  selectedQuestionId: string
  onSelect: (questionId: string) => void
}) {
  const visibleIds = new Set(visibleQuestions.map((question) => question.id))

  return (
    <div className="grid gap-7 sm:grid-cols-2">
      {FAQ_CONCERN_CLUSTERS.map((cluster) => {
        const questions = FAQ_QUESTIONS.filter(
          (question) => question.clusterId === cluster.id && visibleIds.has(question.id),
        )
        if (questions.length === 0) return null
        return (
          <section
            key={cluster.id}
            aria-labelledby={`faq-cluster-${cluster.id}`}
            data-testid="faq-question-cluster"
            className="border-t border-(--color-faq-line-strong) pt-4"
          >
            <h3
              id={`faq-cluster-${cluster.id}`}
              className="text-sm font-semibold tracking-[-0.015em]"
            >
              {cluster.label}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-(--color-faq-ink-faint)">
              {cluster.summary}
            </p>
            <ul className="mt-3">
              {questions.map((question) => {
                const selected = question.id === selectedQuestionId
                return (
                  <li key={question.id} className="border-t border-(--color-faq-line)">
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-controls="faq-selected-answer"
                      onClick={() => onSelect(question.id)}
                      data-testid="faq-question-trigger"
                      className="group flex min-h-11 w-full items-start gap-3 rounded-sm py-2.5 text-left text-sm leading-snug outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 font-mono text-[10px] text-(--color-faq-ink-faint)"
                      >
                        {String(question.order).padStart(2, '0')}
                      </span>
                      <span
                        className={
                          selected
                            ? 'font-semibold text-(--color-faq-stage-ink)'
                            : 'text-(--color-faq-ink-soft) group-hover:text-(--color-faq-ink)'
                        }
                      >
                        {question.title}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function AnswerSurface({
  question,
  titleRef,
}: {
  question: FaqQuestion
  titleRef: RefObject<HTMLHeadingElement | null>
}) {
  const cluster = FAQ_CONCERN_CLUSTERS.find((item) => item.id === question.clusterId)
  return (
    <article
      id="faq-selected-answer"
      aria-labelledby="faq-selected-answer-title"
      className="rounded-3xl border border-(--color-faq-line) bg-(--color-faq-surface) p-5 shadow-(--shadow-faq-card) sm:p-7 lg:sticky lg:top-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-(--color-faq-stage-ink)">
        {cluster?.label ?? 'Selected concern'} · short answer
      </p>
      <h3
        ref={titleRef}
        id="faq-selected-answer-title"
        tabIndex={-1}
        data-testid="faq-answer-title"
        className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.035em] outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
      >
        {question.title}
      </h3>
      <p
        data-testid="faq-short-answer"
        className="mt-4 text-[15px] leading-relaxed text-(--color-faq-ink-soft)"
      >
        {question.shortAnswer}
      </p>

      <details
        data-testid="faq-evidence-details"
        className="group mt-6 border-t border-(--color-faq-line-strong) pt-1"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)">
          <span>How we know</span>
          <span
            aria-hidden="true"
            className="font-mono text-lg font-normal text-(--color-faq-ink-faint) group-open:hidden"
          >
            +
          </span>
          <span
            aria-hidden="true"
            className="hidden font-mono text-lg font-normal text-(--color-faq-ink-faint) group-open:inline"
          >
            −
          </span>
        </summary>
        <div className="space-y-4 pb-1 pt-2">
          {question.blocks.map((block) => (
            <EvidenceBlock key={block.id} block={block} />
          ))}
        </div>
      </details>
    </article>
  )
}

function EvidenceBlock({ block }: { block: FaqEvidenceBlock }) {
  const sources = block.sourceIds.map((id) => ({ id, source: SOURCE_BY_ID.get(id) }))
  const provenance = block.provenanceIds.map((id) => ({
    id,
    item: PROVENANCE_BY_ID.get(id),
  }))
  const unsettled = block.label === 'Team check'

  return (
    <section className="rounded-2xl border border-(--color-faq-line) bg-(--color-faq-paper) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          data-testid="faq-evidence-label"
          className="rounded-full border border-(--color-faq-line-strong) px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.09em]"
        >
          {block.label}
        </span>
        <time
          dateTime={block.review.lastReviewed}
          className="text-[10px] text-(--color-faq-ink-faint)"
        >
          Last reviewed {block.review.lastReviewed}
        </time>
      </div>
      <h4 className="mt-3 text-base font-semibold tracking-[-0.02em]">{block.heading}</h4>
      <p className="mt-2 text-sm leading-relaxed text-(--color-faq-ink-soft)">{block.text}</p>

      {unsettled ? (
        <p className="mt-3 border-l-2 border-(--color-faq-stage) pl-3 text-xs font-semibold leading-relaxed text-(--color-faq-stage-ink)">
          Unsettled — requires team verification before this can become a product or policy claim.
        </p>
      ) : null}

      <dl className="mt-4 grid gap-3 text-xs">
        <div>
          <dt className="font-semibold text-(--color-faq-ink)">Context</dt>
          <dd className="mt-1 leading-relaxed text-(--color-faq-ink-soft)">
            {block.populationContext}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-(--color-faq-ink)">Fit</dt>
          <dd className="mt-1 leading-relaxed text-(--color-faq-ink-soft)">{block.fit}</dd>
        </div>
        <div>
          <dt className="font-semibold text-(--color-faq-ink)">Limitation</dt>
          <dd className="mt-1 leading-relaxed text-(--color-faq-ink-soft)">{block.limitations}</dd>
        </div>
        <div>
          <dt className="font-semibold text-(--color-faq-ink)">Review status</dt>
          <dd className="mt-1 leading-relaxed text-(--color-faq-ink-soft)">
            {REVIEW_STATUS_LABEL[block.review.status]} · {block.review.reviewerRole}
          </dd>
        </div>
      </dl>

      {sources.length > 0 ? (
        <div className="mt-4 border-t border-(--color-faq-line) pt-3">
          <h5 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-(--color-faq-ink-faint)">
            External sources
          </h5>
          <ul className="mt-2 space-y-2 text-xs">
            {sources.map(({ id, source }) => (
              <li key={id}>
                {source ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold leading-relaxed text-(--color-faq-ink) underline decoration-(--color-faq-line-strong) underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
                  >
                    {source.title} — {source.publisher}
                  </a>
                ) : (
                  <span className="text-(--color-faq-stage-ink)">Unresolved source: {id}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {provenance.length > 0 ? (
        <div className="mt-4 border-t border-(--color-faq-line) pt-3">
          <h5 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-(--color-faq-ink-faint)">
            Product / repository basis
          </h5>
          <ul className="mt-2 space-y-2 text-xs text-(--color-faq-ink-soft)">
            {provenance.map(({ id, item }) => (
              <li key={id}>
                {item ? (
                  <>
                    <span className="font-semibold text-(--color-faq-ink)">{item.title}</span>
                    <span className="block font-mono text-[10px] leading-relaxed">
                      {item.repoPaths.join(' · ')}
                    </span>
                  </>
                ) : (
                  <span className="text-(--color-faq-stage-ink)">Unresolved provenance: {id}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
