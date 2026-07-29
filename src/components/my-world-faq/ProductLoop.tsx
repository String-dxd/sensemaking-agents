import { Pause, Play, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { DEFAULT_MY_WORLD_FAQ_CONTENT, type MyWorldFaqContent } from '~/data/my-world-faq'

type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended'

export interface ProductLoopProps {
  content?: MyWorldFaqContent
}

export function ProductLoop({ content = DEFAULT_MY_WORLD_FAQ_CONTENT }: ProductLoopProps = {}) {
  const [activeId, setActiveId] = useState(content.productSteps[0]?.id ?? '')
  const [playback, setPlayback] = useState<PlaybackState>('idle')
  const videoRef = useRef<HTMLVideoElement>(null)
  const activeClip =
    content.productSteps.find((clip) => clip.id === activeId) ?? content.productSteps[0]
  const activeAsset = content.assets.find((asset) => asset.id === activeClip?.assetId)
  if (!activeClip || !activeAsset) return null
  const descriptionId = `product-clip-description-${activeClip.id}`

  const selectClip = (value: string | null) => {
    if (!value || value === activeId) return
    videoRef.current?.pause()
    setPlayback('idle')
    setActiveId(value)
  }

  const playClip = async (restart = false) => {
    const video = videoRef.current
    if (!video) return
    if (restart) video.currentTime = 0
    try {
      await video.play()
      setPlayback('playing')
    } catch {
      setPlayback('paused')
    }
  }

  const pauseClip = () => {
    videoRef.current?.pause()
    setPlayback('paused')
  }

  const control =
    playback === 'playing' ? (
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={pauseClip}
        className="faq-button-secondary absolute right-4 bottom-4 z-10 min-w-28 gap-2 border-(--color-faq-ink) bg-(--color-faq-surface) shadow-sm"
        aria-label={`Pause ${activeClip.title} clip`}
      >
        <Pause aria-hidden="true" className="size-4" />
        Pause
      </Button>
    ) : (
      <Button
        type="button"
        variant="default"
        size="lg"
        onClick={() => void playClip(playback === 'ended')}
        className="faq-button-primary absolute top-1/2 left-1/2 z-10 min-w-32 -translate-x-1/2 -translate-y-1/2 gap-2 border border-(--color-faq-ink) bg-(--color-faq-ink) text-(--color-faq-paper) shadow-lg"
        aria-label={`${playback === 'ended' ? 'Replay' : playback === 'paused' ? 'Resume' : 'Play'} ${activeClip.title} clip`}
      >
        {playback === 'ended' ? (
          <RotateCcw aria-hidden="true" className="size-4" />
        ) : (
          <Play aria-hidden="true" className="size-4 fill-current" />
        )}
        {playback === 'ended' ? 'Replay' : playback === 'paused' ? 'Resume' : 'Play clip'}
      </Button>
    )

  return (
    <section
      id="product"
      aria-labelledby="product-loop-title"
      className="scroll-mt-16 border-b border-(--color-faq-line)"
      data-testid="faq-product-loop"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-(--color-faq-stage-ink)">
            {content.page.product.eyebrow}
          </p>
          <h2
            id="product-loop-title"
            className="mt-2 text-[clamp(1.9rem,4vw,3.2rem)] font-semibold leading-tight tracking-[-0.045em] text-balance"
          >
            {content.page.product.heading}
          </h2>
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-(--color-faq-ink-soft)">
            {content.page.product.introduction}
          </p>
        </div>

        <Tabs value={activeId} onValueChange={selectClip} className="mt-8">
          <div className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
            <TabsList aria-label="Product journeys">
              {content.productSteps.map((clip) => (
                <TabsTrigger key={clip.id} value={clip.id}>
                  {clip.title}
                </TabsTrigger>
              ))}
              <TabsIndicator className="bg-(--color-faq-stage)" />
            </TabsList>
          </div>

          <TabsContent value={activeClip.id} className="pt-7">
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center lg:gap-10">
              <figure className="min-w-0">
                <div className="relative aspect-[8/5] overflow-hidden rounded-[2.5rem_0.75rem_2.5rem_0.75rem] border border-(--color-faq-ink) bg-(--color-faq-paper-soft)">
                  <video
                    key={activeClip.id}
                    ref={videoRef}
                    src={activeAsset.videoPath}
                    poster={activeAsset.publicPath}
                    preload="metadata"
                    muted
                    playsInline
                    aria-label={activeAsset.alt}
                    aria-describedby={descriptionId}
                    data-testid="faq-product-video"
                    className="size-full object-contain"
                    onPlay={() => setPlayback('playing')}
                    onPause={() => {
                      if (videoRef.current?.ended) return
                      setPlayback((state) => (state === 'idle' ? 'idle' : 'paused'))
                    }}
                    onEnded={() => setPlayback('ended')}
                  />
                  {control}
                </div>
                <figcaption
                  id={descriptionId}
                  className="mt-3 max-w-[80ch] text-xs leading-relaxed text-(--color-faq-ink-faint)"
                >
                  {activeAsset.transcript}
                </figcaption>
              </figure>

              <div className="max-w-lg">
                <Badge
                  variant="outline"
                  className="border-(--color-faq-stage-line) bg-(--color-faq-stage-soft) text-(--color-faq-stage-ink)"
                >
                  Synthetic demo
                </Badge>
                <h3 className="mt-5 text-2xl font-semibold tracking-[-0.035em]">
                  {activeClip.heading}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                  {activeClip.body}
                </p>
                <div className="mt-5 flex gap-3 text-sm font-medium leading-relaxed">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2.5 shrink-0 rounded-full bg-(--color-faq-coral)"
                  />
                  <p>{activeClip.boundary}</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <p className="mt-6 text-xs text-(--color-faq-ink-faint)">{content.page.product.footnote}</p>
      </div>
    </section>
  )
}
