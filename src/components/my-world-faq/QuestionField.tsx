import { ArrowUpRight, RotateCcw, X } from 'lucide-react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button, buttonVariants } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '~/components/ui/tabs'
import type {
  MyWorldFaqContent,
  MyWorldFaqEvidenceBlock,
  MyWorldFaqQuestion,
} from '~/data/my-world-faq'
import { cn } from '~/lib/utils'
import type { MyWorldFaqFieldRenderer } from './FaqFieldRenderer'

function displayQuestion(question: MyWorldFaqQuestion) {
  return question.displayedQuestion
}

const CARD_TONES = [
  {
    surface: 'var(--color-faq-coral)',
    ink: 'var(--color-faq-ink)',
    accent: 'var(--color-faq-yellow)',
  },
  {
    surface: 'var(--color-faq-blue)',
    ink: 'var(--color-faq-ink)',
    accent: 'var(--color-faq-pink)',
  },
  {
    surface: 'var(--color-faq-green)',
    ink: 'var(--color-faq-ink)',
    accent: 'var(--color-faq-yellow)',
  },
  {
    surface: 'var(--color-faq-pink)',
    ink: 'var(--color-faq-ink)',
    accent: 'var(--color-faq-blue)',
  },
  {
    surface: 'var(--color-faq-yellow)',
    ink: 'var(--color-faq-ink)',
    accent: 'var(--color-faq-coral)',
  },
  {
    surface: 'var(--color-faq-surface)',
    ink: 'var(--color-faq-ink)',
    accent: 'var(--color-faq-green)',
  },
] as const

const CARD_SHAPES = [
  'rounded-[2.75rem_1rem_2.75rem_1rem]',
  'rounded-[1rem_2.75rem_1rem_2.75rem]',
  'rounded-[2.75rem_2.75rem_1rem_2.75rem]',
] as const

export interface QuestionFieldProps {
  content: MyWorldFaqContent
  editorMode?: boolean
  renderField?: MyWorldFaqFieldRenderer
}

export function QuestionField({ content, editorMode = false, renderField }: QuestionFieldProps) {
  const firstCluster = content.concernClusters[0]
  if (!firstCluster) return null
  const field: MyWorldFaqFieldRenderer = (args) => renderField?.(args) ?? args.value

  return (
    <section
      id="faq"
      aria-labelledby="question-field-title"
      className="scroll-mt-16 border-b border-(--color-faq-line)"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-(--color-faq-stage-ink)">
            {field({
              path: 'page.faq.eyebrow',
              label: 'FAQ section label',
              value: content.page.faq.eyebrow,
            })}
          </p>
          <h2
            id="question-field-title"
            className="mt-2 text-[clamp(1.9rem,4vw,3.2rem)] font-semibold leading-tight tracking-[-0.045em] text-balance"
          >
            {field({
              path: 'page.faq.heading',
              label: 'FAQ section heading',
              value: content.page.faq.heading,
            })}
          </h2>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-(--color-faq-ink-soft)">
            {field({
              path: 'page.faq.introduction',
              label: 'FAQ section introduction',
              value: content.page.faq.introduction,
            })}
          </p>
        </div>

        {editorMode && renderField ? (
          <div className="mt-8 space-y-10" data-testid="faq-editor-question-field">
            {content.concernClusters.map((cluster) => {
              const questions = content.questions.filter(
                (question) => question.clusterId === cluster.id,
              )
              return (
                <section
                  key={cluster.id}
                  aria-label={`${cluster.label} questions`}
                  className="rounded-[2rem_0.75rem_2rem_0.75rem] border border-(--color-faq-line-strong) bg-(--color-faq-surface) p-4 sm:p-6"
                  data-testid="faq-question-cluster"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                    {renderField({
                      path: `concernClusters.${cluster.id}.label`,
                      label: 'Topic label',
                      value: cluster.label,
                    })}
                    {renderField({
                      path: `concernClusters.${cluster.id}.summary`,
                      label: 'Topic summary',
                      value: cluster.summary,
                    })}
                  </div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {questions.map((question, index) => (
                      <EditorQuestionCard
                        key={question.id}
                        question={question}
                        index={index}
                        content={content}
                        renderField={renderField}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <Tabs defaultValue={firstCluster.id} className="mt-8">
            <div className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
              <TabsList aria-label="FAQ topics">
                {content.concernClusters.map((cluster) => (
                  <TabsTrigger key={cluster.id} value={cluster.id}>
                    {cluster.label}
                  </TabsTrigger>
                ))}
                <TabsIndicator className="bg-(--color-faq-stage)" />
              </TabsList>
            </div>

            {content.concernClusters.map((cluster) => {
              const questions = content.questions.filter(
                (question) => question.clusterId === cluster.id,
              )
              return (
                <TabsContent
                  key={cluster.id}
                  value={cluster.id}
                  keepMounted
                  className="pt-7"
                  data-testid="faq-question-cluster"
                >
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <p className="max-w-[60ch] text-sm leading-relaxed text-(--color-faq-ink-soft)">
                      {cluster.summary}
                    </p>
                    <span className="text-xs tabular-nums text-(--color-faq-ink-faint)">
                      {questions.length} {questions.length === 1 ? 'question' : 'questions'}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {questions.map((question, index) => (
                      <FaqFlipCard
                        key={question.id}
                        question={question}
                        index={index}
                        content={content}
                      />
                    ))}
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>
        )}
      </div>
    </section>
  )
}

function EditorQuestionCard({
  question,
  index,
  content,
  renderField,
}: {
  question: MyWorldFaqQuestion
  index: number
  content: MyWorldFaqContent
  renderField: MyWorldFaqFieldRenderer
}) {
  return (
    <article
      className="rounded-[1.5rem_0.5rem_1.5rem_0.5rem] border border-(--color-faq-line) bg-(--color-faq-paper) p-4"
      data-testid="faq-editor-question-card"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-(--color-faq-stage-ink)">
        Question {String(index + 1).padStart(2, '0')}
      </p>
      {renderField({
        path: `questions.${question.id}.displayedQuestion`,
        label: 'Question',
        value: question.displayedQuestion,
      })}
      {renderField({
        path: `questions.${question.id}.shortAnswer`,
        label: 'Short answer',
        value: question.shortAnswer,
      })}
      <div className="mt-3">
        <FaqEvidenceDialog
          question={question}
          content={content}
          editorMode
          renderField={renderField}
        />
      </div>
    </article>
  )
}

function FaqFlipCard({
  question,
  index,
  content,
}: {
  question: MyWorldFaqQuestion
  index: number
  content: MyWorldFaqContent
}) {
  const [flipped, setFlipped] = useState(false)
  const frontButtonRef = useRef<HTMLButtonElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const hasInteractedRef = useRef(false)
  const questionText = displayQuestion(question)
  const questionHeadingId = `faq-question-${question.id}`
  const answerId = `faq-answer-${question.id}`
  const tone = CARD_TONES[index % CARD_TONES.length] ?? CARD_TONES[0]
  const shape = CARD_SHAPES[index % CARD_SHAPES.length] ?? CARD_SHAPES[0]

  useEffect(() => {
    if (!hasInteractedRef.current) return
    if (flipped) {
      answerRef.current?.focus()
    } else {
      frontButtonRef.current?.focus()
    }
  }, [flipped])

  const showAnswer = () => {
    hasInteractedRef.current = true
    setFlipped(true)
  }

  const showQuestion = () => {
    hasInteractedRef.current = true
    setFlipped(false)
  }

  const cardStyle = {
    '--faq-card-surface': tone.surface,
    '--faq-card-ink': tone.ink,
    '--faq-card-accent': tone.accent,
  } as CSSProperties

  return (
    <div className="relative min-h-[23rem] [perspective:1200px]" data-testid="faq-question-card">
      <Card
        data-flipped={flipped}
        style={cardStyle}
        className={cn(
          'faq-flip-card relative grid min-h-[23rem] border-(--faq-card-ink) bg-(--faq-card-surface) p-0 text-(--faq-card-ink) shadow-none',
          '[transform-style:preserve-3d] transition-transform duration-500 ease-(--ease-in-out)',
          'data-[flipped=true]:[transform:rotateY(180deg)] motion-reduce:transform-none motion-reduce:transition-none',
          shape,
        )}
      >
        <div
          aria-hidden={flipped}
          // `inert` keeps the hidden face and its controls out of the keyboard order.
          inert={flipped}
          className={cn(
            'absolute inset-0 overflow-hidden rounded-[inherit] bg-(--faq-card-surface) [backface-visibility:hidden]',
            flipped ? 'pointer-events-none motion-reduce:hidden' : 'pointer-events-auto',
          )}
        >
          <h3 id={questionHeadingId} className="sr-only">
            {questionText}
          </h3>
          <Button
            ref={frontButtonRef}
            type="button"
            variant="ghost"
            data-testid="faq-question-trigger"
            aria-labelledby={questionHeadingId}
            aria-expanded={flipped}
            aria-controls={answerId}
            onClick={showAnswer}
            className={cn(
              'relative flex min-h-[23rem] w-full flex-col items-start justify-between overflow-hidden p-6 text-left text-(--faq-card-ink)',
              'rounded-[inherit] whitespace-normal hover:bg-black/5 focus-visible:ring-(--color-faq-focus) focus-visible:ring-inset',
              'active:scale-[0.99] sm:p-7',
            )}
          >
            <span
              aria-hidden="true"
              className="absolute -right-8 -top-9 size-32 rounded-full border border-current opacity-35"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-12 -left-6 h-28 w-40 rounded-t-full bg-(--faq-card-accent) opacity-75"
            />
            <span className="relative text-xs font-semibold uppercase tracking-[0.12em]">
              Question {String(index + 1).padStart(2, '0')}
            </span>
            <span className="relative max-w-[24ch] text-[clamp(1.35rem,2.2vw,1.8rem)] font-semibold leading-[1.12] tracking-[-0.035em] text-pretty">
              {questionText}
            </span>
            <span className="relative inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
              Turn over
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </span>
          </Button>
        </div>

        <div
          id={answerId}
          ref={answerRef}
          tabIndex={-1}
          aria-hidden={!flipped}
          inert={!flipped}
          className={cn(
            'absolute inset-0 flex flex-col overflow-hidden rounded-[inherit] bg-(--faq-card-surface) [backface-visibility:hidden] [transform:rotateY(180deg)]',
            'p-6 outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-inset sm:p-7',
            'motion-reduce:transform-none',
            flipped
              ? 'pointer-events-auto motion-reduce:flex'
              : 'pointer-events-none motion-reduce:hidden',
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">Short answer</p>
          <p
            data-testid="faq-short-answer"
            className="mt-5 text-base leading-relaxed text-pretty sm:text-[1.05rem]"
          >
            {question.shortAnswer}
          </p>
          <div className="mt-auto flex items-center gap-2 pt-5">
            <FaqEvidenceDialog question={question} content={content} />
            <Button
              type="button"
              variant="ghost"
              size="default"
              aria-label="Back to question"
              onClick={showQuestion}
              className="min-h-11 shrink-0 gap-2 rounded-[1.4rem_0.5rem_1.4rem_0.5rem] px-3 text-(--faq-card-ink) hover:bg-black/8 focus-visible:ring-(--color-faq-focus)"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Back
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function FaqEvidenceDialog({
  question,
  content,
  editorMode = false,
  renderField,
}: {
  question: MyWorldFaqQuestion
  content: MyWorldFaqContent
  editorMode?: boolean
  renderField?: MyWorldFaqFieldRenderer
}) {
  return (
    <Dialog>
      <DialogTrigger
        data-testid="faq-evidence-trigger"
        className={cn(
          buttonVariants({ variant: 'default', size: 'lg' }),
          'min-h-11 flex-1 rounded-[1.4rem_0.5rem_1.4rem_0.5rem] bg-(--faq-card-ink) px-3 text-(--faq-card-surface) hover:bg-(--faq-card-ink)/90 focus-visible:ring-(--color-faq-focus)',
        )}
      >
        Evidence and limits
        <ArrowUpRight aria-hidden="true" className="ml-2 size-4" />
      </DialogTrigger>
      <DialogContent
        data-testid="faq-evidence-details"
        className="max-h-[min(90svh,52rem)] max-w-3xl overflow-y-auto rounded-[2.5rem_0.75rem_2.5rem_0.75rem] border-(--color-faq-line-strong) bg-(--color-faq-surface) p-6 shadow-(--shadow-faq-card) sm:p-9"
        showClose={false}
      >
        <DialogClose
          aria-label="Close evidence"
          className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full text-(--color-faq-ink-soft) outline-none hover:bg-(--color-faq-paper) hover:text-(--color-faq-ink) focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) sm:right-5 sm:top-5"
        >
          <X aria-hidden="true" className="size-5" />
        </DialogClose>
        <DialogHeader className="pr-10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--color-faq-stage-ink)">
            Evidence and limits
          </p>
          <DialogTitle className="mt-2 text-[clamp(1.65rem,4vw,2.5rem)] leading-[1.08] tracking-[-0.04em] text-(--color-faq-ink) text-pretty">
            {displayQuestion(question)}
          </DialogTitle>
          <DialogDescription className="mt-3 text-base leading-relaxed text-(--color-faq-ink-soft) text-pretty">
            {question.shortAnswer}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3 space-y-7">
          {question.blocks.map((block) => (
            <EvidenceBlock
              key={block.id}
              block={block}
              content={content}
              questionId={question.id}
              editorMode={editorMode}
              renderField={renderField}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EvidenceBlock({
  block,
  content,
  questionId,
  editorMode = false,
  renderField,
}: {
  block: MyWorldFaqEvidenceBlock
  content: MyWorldFaqContent
  questionId: string
  editorMode?: boolean
  renderField?: MyWorldFaqFieldRenderer
}) {
  const sources = block.sourceIds.flatMap((id) => {
    const source = content.sources.find((item) => item.id === id)
    return source ? [source] : []
  })
  const provenance = block.provenanceIds.flatMap((id) => {
    const item = content.productProvenance.find((candidate) => candidate.id === id)
    return item ? [item] : []
  })
  const blockPath = `questions.${questionId}.blocks.${block.id}`

  return (
    <section className="border-t border-(--color-faq-line) pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          size="sm"
          data-testid="faq-evidence-label"
          className="border-(--color-faq-line-strong) bg-(--color-faq-paper)"
        >
          {block.label}
        </Badge>
        <time dateTime={block.review.lastReviewed} className="text-xs text-(--color-faq-ink-faint)">
          Reviewed {block.review.lastReviewed}
        </time>
      </div>
      {editorMode && renderField ? (
        <div className="mt-3">
          {renderField({
            path: `${blockPath}.heading`,
            label: 'Evidence heading',
            value: block.heading,
          })}
          {renderField({
            path: `${blockPath}.text`,
            label: 'Evidence',
            value: block.text,
          })}
          {renderField({
            path: `${blockPath}.populationContext`,
            label: 'Population context',
            value: block.populationContext,
          })}
          {renderField({
            path: `${blockPath}.fit`,
            label: 'Why it fits',
            value: block.fit,
          })}
          {renderField({
            path: `${blockPath}.limitations`,
            label: 'Limitations',
            value: block.limitations,
          })}
        </div>
      ) : (
        <>
          <h3 className="mt-3 text-base font-semibold tracking-[-0.02em]">{block.heading}</h3>
          <p className="mt-2 text-sm leading-relaxed text-(--color-faq-ink-soft) text-pretty">
            {block.text}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-(--color-faq-ink-faint) text-pretty">
            <span className="font-semibold text-(--color-faq-ink-soft)">Limit: </span>
            {block.limitations}
          </p>
        </>
      )}

      {sources.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm">
          {sources.map((source) => (
            <li key={source.id}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center font-medium text-(--color-faq-ink) underline decoration-(--color-faq-line-strong) underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
              >
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {provenance.length > 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-(--color-faq-ink-faint)">
          Checked against the current prototype: {provenance.map((item) => item.title).join(', ')}.
        </p>
      ) : null}
    </section>
  )
}
