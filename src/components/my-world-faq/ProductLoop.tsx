import { FAQ_ASSETS } from '~/data/my-world-faq'

const LOOP_STEPS = [
  {
    number: '01',
    assetId: 'product-01-capture',
    title: 'Capture',
    body: 'A student starts with a moment—in voice, text, an image, or a mood check. Kira’s intended role is brief: ask one grounded question and return the floor.',
  },
  {
    number: '02',
    assetId: 'product-02-sensemake',
    title: 'Sensemake',
    body: 'Mirror prepares a reviewable reflection from what the student supplied. It should preserve uncertainty rather than turn one moment into a settled identity.',
  },
  {
    number: '03',
    assetId: 'product-03-review',
    title: 'Review',
    body: 'The student can inspect the reflection, then Log or Forget it. Later evidence links remain reviewable rather than becoming invisible profile claims.',
  },
  {
    number: '04',
    assetId: 'product-04-act-return',
    title: 'Act / Return',
    body: 'The product can offer exploration prompts, Path Finder questions, and links back to evidence. A student may return to people, paper, or the world outside the app.',
  },
] as const

export function ProductLoop() {
  return (
    <section
      aria-labelledby="product-loop-title"
      className="border-b border-(--color-faq-line)"
      data-testid="faq-product-loop"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="max-w-2xl lg:col-span-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-faq-ink-faint)">
              The current loop · about 20 seconds
            </p>
            <h2
              id="product-loop-title"
              className="mt-3 text-[clamp(1.9rem,4vw,3.2rem)] font-semibold leading-tight tracking-[-0.045em]"
            >
              Capture → Sensemake → Review → Act / Return
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-(--color-faq-ink-soft) lg:col-span-4">
            This is a product map, not an outcome claim. The current-interface captures below use
            the repository’s synthetic <code className="font-mono text-xs">demo-a</code> fixture,
            never a real student.
          </p>
        </div>

        <ol className="mt-9 grid gap-px overflow-hidden rounded-3xl border border-(--color-faq-line) bg-(--color-faq-line) sm:grid-cols-2 lg:grid-cols-4">
          {LOOP_STEPS.map((step) => {
            const asset = FAQ_ASSETS.find((item) => item.id === step.assetId)
            return (
              <li key={step.title} className="flex min-h-64 flex-col bg-(--color-faq-surface) p-4">
                <div className="flex items-center justify-between gap-3 px-2 py-1">
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs text-(--color-faq-ink-faint)"
                  >
                    {step.number}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-(--color-faq-ink-faint)">
                    Synthetic demo data
                  </span>
                </div>
                {asset ? (
                  <figure className="mt-3">
                    <a
                      href={asset.publicPath}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${step.title} interface screenshot at full size`}
                      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-faq-surface)"
                    >
                      <img
                        src={asset.publicPath}
                        width={asset.width}
                        height={asset.height}
                        alt={asset.alt}
                        loading="lazy"
                        decoding="async"
                        data-testid="faq-product-image"
                        className="h-52 w-full rounded-xl bg-(--color-faq-paper) object-contain image-outline"
                      />
                    </a>
                    <figcaption className="sr-only">
                      Current interface shown with synthetic demo-a data.
                    </figcaption>
                  </figure>
                ) : null}
                <div className="px-2 pb-2">
                  <h3 className="mt-6 text-xl font-semibold tracking-[-0.03em]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                    {step.body}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          <p className="border-l-2 border-(--color-faq-stage) pl-4 leading-relaxed text-(--color-faq-ink-soft)">
            <strong className="font-semibold text-(--color-faq-ink)">
              Connector happens later.
            </strong>{' '}
            Manual or scheduled linking is the production default; capture-time linking is
            feature-controlled, not universal.
          </p>
          <p className="border-l-2 border-(--color-faq-stage) pl-4 leading-relaxed text-(--color-faq-ink-soft)">
            <strong className="font-semibold text-(--color-faq-ink)">
              Island growth is separate.
            </strong>{' '}
            It is capture-count-driven visual feedback today, not evidence that reflection quality
            improved.
          </p>
          <p className="border-l-2 border-(--color-faq-stage) pl-4 leading-relaxed text-(--color-faq-ink-soft)">
            <strong className="font-semibold text-(--color-faq-ink)">“Act” is still modest.</strong>{' '}
            It means exploration, prompts, and evidence links—not task tracking or proof of
            follow-through.
          </p>
        </div>
      </div>
    </section>
  )
}
