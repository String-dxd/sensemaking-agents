import { useEffect, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import {
  DEFAULT_MY_WORLD_FAQ_BUILD_STORY,
  type MyWorldFaqBuildStory,
  type MyWorldFaqContent,
} from '~/data/my-world-faq'
import type { MyWorldFaqFieldRenderer } from './FaqFieldRenderer'

const SURFACE_FEATURES = [
  {
    label: 'Companion',
    key: 'companionBody',
    fieldLabel: 'Companion description',
  },
  {
    label: 'Capture',
    key: 'captureBody',
    fieldLabel: 'Capture description',
  },
  {
    label: 'Living island',
    key: 'islandBody',
    fieldLabel: 'Living island description',
  },
] as const

const BACKSTAGE_LAYERS = [
  {
    name: 'Collector',
    roleType: 'AI support',
    bodyKey: 'mirrorBody',
  },
  {
    name: 'Connector',
    roleType: 'AI support',
    bodyKey: 'connectorBody',
    check: {
      name: 'Verifier',
      roleType: 'Evidence check',
      bodyKey: 'verifierBody',
    },
  },
  {
    name: 'Cartographer',
    roleType: 'AI support',
    bodyKey: 'cartographerBody',
  },
] as const

export interface BuildIcebergPanelProps {
  content: MyWorldFaqContent
  renderField?: MyWorldFaqFieldRenderer
}

export function BuildIcebergPanel({ content, renderField }: BuildIcebergPanelProps) {
  const copy = content.page.build ?? DEFAULT_MY_WORLD_FAQ_BUILD_STORY
  const field: MyWorldFaqFieldRenderer = (args) => renderField?.(args) ?? args.value

  return (
    <section
      id="build"
      aria-labelledby="faq-build-title"
      data-testid="faq-build-iceberg"
      className="bg-(--color-faq-paper) text-(--color-faq-ink)"
    >
      <div className="mx-auto w-full max-w-7xl px-5 pt-16 pb-6 sm:px-8 sm:pt-20 sm:pb-7 lg:px-12 lg:pt-24 lg:pb-8">
        <div className="grid gap-7 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="text-xs font-semibold text-(--color-faq-coral-ink)">
              {field({
                path: 'page.build.eyebrow',
                label: 'Build section label',
                value: copy.eyebrow,
              })}
            </p>
            <h2
              id="faq-build-title"
              className="mt-3 max-w-4xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-balance"
            >
              {field({
                path: 'page.build.heading',
                label: 'Build section heading',
                value: copy.heading,
              })}
            </h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-relaxed text-(--color-faq-ink-soft) lg:col-span-4 lg:justify-self-end">
            {field({
              path: 'page.build.introduction',
              label: 'Build section introduction',
              value: copy.introduction,
            })}
          </p>
        </div>

        <figure className="mt-12 overflow-hidden rounded-[3rem_0.75rem_3rem_0.75rem] border border-(--color-faq-ink)">
          <figcaption className="sr-only">
            An iceberg diagram. Students see the playful experience above the surface. AI support,
            an evidence check and human review sit below it.
          </figcaption>

          <div className="bg-(--color-faq-blue) px-5 pt-8 sm:px-8 sm:pt-10 lg:px-10 lg:pt-12">
            <div className="grid items-end gap-6 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,2fr)] md:gap-10">
              <IcebergCap />
              <div className="order-1 pb-8 sm:pb-10 md:order-none lg:pb-12">
                <Badge
                  variant="outline"
                  className="border-(--color-faq-ink) bg-(--color-faq-yellow) text-(--color-faq-ink)"
                >
                  {field({
                    path: 'page.build.surfaceLabel',
                    label: 'Student surface label',
                    value: copy.surfaceLabel,
                  })}
                </Badge>
                <ul className="mt-6 grid gap-px overflow-hidden rounded-lg border border-(--color-faq-line-strong) bg-(--color-faq-line-strong) sm:grid-cols-3">
                  {SURFACE_FEATURES.map((feature) => (
                    <li key={feature.label} className="bg-(--color-faq-surface) p-5">
                      <p className="font-semibold">{feature.label}</p>
                      <p className="mt-2 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                        {field({
                          path: `page.build.${feature.key}`,
                          label: feature.fieldLabel,
                          value: copy[feature.key],
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div
            data-testid="faq-build-backstage"
            className="relative bg-(--color-faq-blue-deep) px-5 pb-9 text-(--color-faq-paper) sm:px-8 sm:pb-12 lg:px-10 lg:pb-14"
          >
            <div className="grid items-start gap-7 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,2fr)] md:gap-10">
              <IcebergBase />
              <div className="pt-8 sm:pt-10 lg:pt-12">
                <Badge
                  variant="outline"
                  className="border-(--color-faq-paper)/55 bg-(--color-faq-blue-deep) text-(--color-faq-paper)"
                >
                  {field({
                    path: 'page.build.backstageLabel',
                    label: 'Backstage label',
                    value: copy.backstageLabel,
                  })}
                </Badge>
                <p className="mt-4 max-w-[58ch] text-sm leading-relaxed text-(--color-faq-paper-soft)">
                  {field({
                    path: 'page.build.backstageIntroduction',
                    label: 'Backstage timing note',
                    value: copy.backstageIntroduction,
                  })}
                </p>
                <ol className="mt-5 divide-y divide-(--color-faq-paper)/20 border-y border-(--color-faq-paper)/20">
                  {BACKSTAGE_LAYERS.map((layer, index) => (
                    <li
                      key={layer.name}
                      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-5 sm:grid-cols-[2.25rem_10rem_minmax(0,1fr)] sm:gap-4"
                    >
                      <span className="row-span-2 text-xs font-semibold tabular-nums text-(--color-faq-yellow) sm:row-span-1">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="font-semibold">{layer.name}</p>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-(--color-faq-green)">
                            {layer.roleType}
                          </p>
                        </div>
                      </div>
                      <p className="col-start-2 text-sm leading-relaxed text-(--color-faq-paper-soft) sm:col-start-auto">
                        {field({
                          path: `page.build.${layer.bodyKey}`,
                          label: `${layer.name} description`,
                          value: copy[layer.bodyKey],
                        })}
                      </p>
                      {'check' in layer ? (
                        <div
                          data-testid="faq-verifier-panel"
                          className="col-start-2 mt-3 grid gap-3 rounded-[1.25rem_0.5rem_1.25rem_0.5rem] border border-(--color-faq-paper)/25 bg-(--color-faq-paper)/5 p-4 text-left sm:col-end-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
                        >
                          <div>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <p className="text-sm font-semibold">{layer.check.name}</p>
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-(--color-faq-green)">
                                {layer.check.roleType}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm leading-relaxed text-(--color-faq-paper-soft)">
                            {field({
                              path: `page.build.${layer.check.bodyKey}`,
                              label: `${layer.check.name} description`,
                              value: copy[layer.check.bodyKey],
                            })}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>

                <aside className="mt-6 grid gap-3 border-t border-(--color-faq-paper)/20 pt-6 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <p className="text-sm font-semibold text-(--color-faq-pink)">
                    {field({
                      path: 'page.build.reviewLabel',
                      label: 'Review label',
                      value: copy.reviewLabel,
                    })}
                  </p>
                  <div className="space-y-3 text-sm leading-relaxed text-(--color-faq-paper-soft)">
                    <p>
                      {field({
                        path: 'page.build.reviewBody',
                        label: 'AI specialist team description',
                        value: copy.reviewBody,
                      })}
                    </p>
                    <p>
                      {field({
                        path: 'page.build.reviewTeamBody',
                        label: 'Product team description',
                        value: copy.reviewTeamBody,
                      })}
                    </p>
                  </div>
                </aside>
              </div>
            </div>

            <DeliberateDecision copy={copy} field={field} />
          </div>
        </figure>
      </div>
    </section>
  )
}

function IcebergCap() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 220"
      className="order-2 mx-auto w-full max-w-80 self-end md:order-none"
    >
      <path
        d="M18 214 95 119 139 47 187 18 220 83 256 99 342 214Z"
        fill="var(--color-faq-surface)"
        stroke="var(--color-faq-ink)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M102 134c23-30 48-51 77-64M220 117c22 20 38 47 49 82"
        fill="none"
        stroke="var(--color-faq-line-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function IcebergBase() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 440"
      className="mx-auto w-full max-w-60 md:sticky md:top-24 md:max-w-80"
    >
      <path
        d="M18 0h324l-39 84 22 58-70 111-22 152-79 26-55-112-62-101 27-92Z"
        fill="var(--color-faq-paper-soft)"
        stroke="var(--color-faq-paper)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="m69 76 196 35-142 71 116 64-102 74"
        fill="none"
        stroke="var(--color-faq-line-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function DeliberateDecision({
  copy,
  field,
}: {
  copy: MyWorldFaqBuildStory
  field: MyWorldFaqFieldRenderer
}) {
  return (
    <aside
      aria-labelledby="faq-deliberate-decision-title"
      data-testid="faq-deliberate-decision"
      className="mt-10 grid overflow-hidden rounded-[2.5rem_0.75rem_2.5rem_0.75rem] border border-(--color-faq-line-strong) bg-(--color-faq-yellow) text-(--color-faq-ink) lg:grid-cols-[19rem_minmax(0,1fr)]"
    >
      <div className="grid place-items-center border-b border-(--color-faq-line-strong) p-7 lg:border-r lg:border-b-0">
        <RealTimeDisc copy={copy} field={field} />
      </div>
      <div className="p-6 sm:p-8 lg:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">
          {field({
            path: 'page.build.decisionEyebrow',
            label: 'Deliberate decision label',
            value: copy.decisionEyebrow,
          })}
        </p>
        <h3
          id="faq-deliberate-decision-title"
          className="mt-3 text-[clamp(1.65rem,3vw,2.5rem)] font-semibold leading-tight tracking-[-0.04em]"
        >
          {field({
            path: 'page.build.decisionHeading',
            label: 'Deliberate decision heading',
            value: copy.decisionHeading,
          })}
        </h3>
        <div className="mt-5 max-w-[68ch] space-y-4 text-sm leading-relaxed text-(--color-faq-ink-soft)">
          <p>
            {field({
              path: 'page.build.quietHoursBody',
              label: 'Quiet hours explanation',
              value: copy.quietHoursBody,
            })}
          </p>
          <p>
            {field({
              path: 'page.build.precedentBody',
              label: 'Animal Crossing precedent',
              value: copy.precedentBody,
            })}
          </p>
        </div>
      </div>
    </aside>
  )
}

function RealTimeDisc({
  copy,
  field,
}: {
  copy: MyWorldFaqBuildStory
  field: MyWorldFaqFieldRenderer
}) {
  const [now, setNow] = useState<Date | null>(null)
  const clock = formatClockTime(now)

  useEffect(() => {
    setNow(new Date())

    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const at = new Date()
      setNow(at)
      timer = setTimeout(tick, 60_000 - (at.getSeconds() * 1000 + at.getMilliseconds()))
    }
    const first = new Date()
    timer = setTimeout(tick, 60_000 - (first.getSeconds() * 1000 + first.getMilliseconds()))

    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      data-testid="faq-build-clock"
      className="grid aspect-square w-full max-w-52 place-items-center rounded-full border border-(--color-faq-ink) bg-(--color-faq-coral) p-6 text-center sm:max-w-60 sm:p-8"
    >
      <div className="w-full">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">
          {field({
            path: 'page.build.clockLabel',
            label: 'Local clock label',
            value: copy.clockLabel,
          })}
        </p>
        <div aria-hidden="true" suppressHydrationWarning className="mt-4 tabular-nums">
          <span className="block text-[clamp(2.15rem,4vw,3rem)] font-semibold leading-none tracking-[-0.055em]">
            {clock.time}
          </span>
          {clock.dayPeriod ? (
            <span className="mt-1.5 block text-xl font-semibold leading-none tracking-[-0.03em] sm:text-2xl">
              {clock.dayPeriod}
            </span>
          ) : null}
        </div>
        <p className="mx-auto mt-5 max-w-32 text-xs leading-relaxed">
          {field({
            path: 'page.build.clockBody',
            label: 'Local clock description',
            value: copy.clockBody,
          })}
        </p>
      </div>
    </div>
  )
}

function formatClockTime(now: Date | null): { time: string; dayPeriod: string | null } {
  if (!now) return { time: '\u00a0', dayPeriod: null }

  const parts = new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now)
  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value ?? null
  const time = parts
    .filter((part) => part.type !== 'dayPeriod')
    .map((part) => part.value)
    .join('')
    .trim()

  return { time, dayPeriod }
}
