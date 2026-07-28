import { ChevronDown } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion'
import { Badge } from '~/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '~/components/ui/tabs'
import {
  FAQ_CONCERN_CLUSTERS,
  FAQ_PRODUCT_PROVENANCE,
  FAQ_QUESTIONS,
  FAQ_SOURCES,
  type FaqEvidenceBlock,
  type FaqProductProvenance,
  type FaqQuestion,
  type FaqSource,
} from '~/data/my-world-faq'

const SOURCE_BY_ID: ReadonlyMap<string, FaqSource> = new Map(
  FAQ_SOURCES.map((source) => [source.id, source] as const),
)
const PROVENANCE_BY_ID: ReadonlyMap<string, FaqProductProvenance> = new Map(
  FAQ_PRODUCT_PROVENANCE.map((item) => [item.id, item] as const),
)

function displayQuestion(question: FaqQuestion) {
  return question.committedQuestions[0] ?? question.title
}

export function QuestionField() {
  const firstCluster = FAQ_CONCERN_CLUSTERS[0]
  if (!firstCluster) return null

  return (
    <section
      id="faq"
      aria-labelledby="question-field-title"
      className="scroll-mt-16 border-b border-(--color-faq-line)"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-(--color-faq-stage-ink)">FAQ</p>
          <h2
            id="question-field-title"
            className="mt-2 text-[clamp(1.9rem,4vw,3.2rem)] font-semibold leading-tight tracking-[-0.045em] text-balance"
          >
            Questions we are working through
          </h2>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-(--color-faq-ink-soft)">
            Choose a topic, then open a question.
          </p>
        </div>

        <Tabs defaultValue={firstCluster.id} className="mt-8">
          <div className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
            <TabsList aria-label="FAQ topics">
              {FAQ_CONCERN_CLUSTERS.map((cluster) => (
                <TabsTrigger key={cluster.id} value={cluster.id}>
                  {cluster.label}
                </TabsTrigger>
              ))}
              <TabsIndicator className="bg-(--color-faq-stage)" />
            </TabsList>
          </div>

          {FAQ_CONCERN_CLUSTERS.map((cluster) => {
            const questions = FAQ_QUESTIONS.filter((question) => question.clusterId === cluster.id)
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

                <Accordion hiddenUntilFound>
                  {questions.map((question) => (
                    <AccordionItem key={question.id} value={question.id}>
                      <AccordionTrigger data-testid="faq-question-trigger">
                        <span className="max-w-[66ch] text-pretty">
                          {displayQuestion(question)}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <FaqAnswer question={question} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </section>
  )
}

function FaqAnswer({ question }: { question: FaqQuestion }) {
  return (
    <div className="max-w-[70ch]">
      <p
        data-testid="faq-short-answer"
        className="text-base leading-relaxed text-(--color-faq-ink-soft) text-pretty"
      >
        {question.shortAnswer}
      </p>

      <Collapsible className="mt-5 border-t border-(--color-faq-line)">
        <CollapsibleTrigger
          data-testid="faq-evidence-trigger"
          className="group flex min-h-11 w-full items-center justify-between gap-4 rounded-md py-3 text-left text-sm font-semibold text-(--color-faq-ink)"
        >
          Evidence and limits
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-(--color-faq-ink-faint) transition-transform duration-(--duration-fast) ease-(--ease-out) group-data-panel-open:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent data-testid="faq-evidence-details" className="space-y-6 pb-1">
          {question.blocks.map((block) => (
            <EvidenceBlock key={block.id} block={block} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function EvidenceBlock({ block }: { block: FaqEvidenceBlock }) {
  const sources = block.sourceIds.flatMap((id) => {
    const source = SOURCE_BY_ID.get(id)
    return source ? [source] : []
  })
  const provenance = block.provenanceIds.flatMap((id) => {
    const item = PROVENANCE_BY_ID.get(id)
    return item ? [item] : []
  })

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
      <h4 className="mt-3 text-base font-semibold tracking-[-0.02em]">{block.heading}</h4>
      <p className="mt-2 text-sm leading-relaxed text-(--color-faq-ink-soft) text-pretty">
        {block.text}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-(--color-faq-ink-faint) text-pretty">
        <span className="font-semibold text-(--color-faq-ink-soft)">Limit: </span>
        {block.limitations}
      </p>

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
