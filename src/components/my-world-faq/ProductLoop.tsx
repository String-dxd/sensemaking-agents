import { Badge } from '~/components/ui/badge'
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { FAQ_ASSETS } from '~/data/my-world-faq'

const LOOP_STEPS = [
  {
    assetId: 'product-01-capture',
    title: 'Capture',
    body: 'Record a moment with text, voice, an image or a mood.',
    boundary: 'Kira asks brief questions based on what the student shares.',
  },
  {
    assetId: 'product-02-sensemake',
    title: 'Sensemake',
    body: 'Turn the moment into a draft reflection the student can review.',
    boundary: 'One moment should remain evidence, not become a fixed identity.',
  },
  {
    assetId: 'product-03-review',
    title: 'Review',
    body: 'Keep, correct or forget a reflection before it shapes later patterns.',
    boundary: 'Students need a clear way to challenge an interpretation.',
  },
  {
    assetId: 'product-04-act-return',
    title: 'Act or return',
    body: 'Use patterns as prompts for further exploration, then step away.',
    boundary: 'The product should lead back to people and life outside the screen.',
  },
] as const

export function ProductLoop() {
  return (
    <section
      id="product"
      aria-labelledby="product-loop-title"
      className="scroll-mt-16 border-b border-(--color-faq-line)"
      data-testid="faq-product-loop"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-(--color-faq-stage-ink)">Product at a glance</p>
          <h2
            id="product-loop-title"
            className="mt-2 text-[clamp(1.9rem,4vw,3.2rem)] font-semibold leading-tight tracking-[-0.045em] text-balance"
          >
            From a moment to a next step
          </h2>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-(--color-faq-ink-soft)">
            Follow one reflection through the current prototype.
          </p>
        </div>

        <Tabs defaultValue={LOOP_STEPS[0].assetId} className="mt-8">
          <div className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
            <TabsList aria-label="Product steps">
              {LOOP_STEPS.map((step) => (
                <TabsTrigger key={step.assetId} value={step.assetId}>
                  {step.title}
                </TabsTrigger>
              ))}
              <TabsIndicator className="bg-(--color-faq-stage)" />
            </TabsList>
          </div>

          {LOOP_STEPS.map((step) => {
            const asset = FAQ_ASSETS.find((item) => item.id === step.assetId)
            if (!asset) return null
            return (
              <TabsContent key={step.assetId} value={step.assetId} keepMounted className="pt-8">
                <div className="grid gap-8 lg:grid-cols-[minmax(18rem,28rem)_minmax(0,1fr)] lg:items-center lg:gap-14">
                  <figure className="mx-auto w-full max-w-[28rem] lg:mx-0">
                    <a
                      href={asset.publicPath}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open the full ${step.title} screen`}
                      className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-4"
                    >
                      <img
                        src={asset.publicPath}
                        width={asset.width}
                        height={asset.height}
                        alt={asset.alt}
                        loading="lazy"
                        decoding="async"
                        data-testid="faq-product-image"
                        className="h-auto w-full rounded-lg image-outline"
                      />
                    </a>
                    <figcaption className="mt-3 text-xs leading-relaxed text-(--color-faq-ink-faint)">
                      Full prototype screen with synthetic demo data.
                    </figcaption>
                  </figure>

                  <div className="max-w-xl">
                    <Badge variant="outline">{step.title}</Badge>
                    <h3 className="mt-5 text-2xl font-semibold tracking-[-0.035em]">{step.body}</h3>
                    <p className="mt-4 max-w-[55ch] text-base leading-relaxed text-(--color-faq-ink-soft)">
                      {step.boundary}
                    </p>
                  </div>
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </section>
  )
}
