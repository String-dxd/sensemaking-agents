import { FAQ_ASSETS } from '~/data/my-world-faq'

export function SignalSourceStrip() {
  const eventSignals = FAQ_ASSETS.filter((asset) => asset.kind === 'event-signal')

  return (
    <section
      aria-labelledby="signal-source-title"
      className="border-b border-(--color-faq-line) bg-(--color-faq-surface)"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:px-10">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-faq-ink-faint)">
              Source strip
            </p>
            <h2 id="signal-source-title" className="mt-2 text-xl font-semibold tracking-[-0.03em]">
              Questions we heard
            </h2>
          </div>
          <div className="max-w-2xl text-sm leading-relaxed text-(--color-faq-ink-soft)">
            <p>
              Anonymous event feedback is a source of questions, not a representative survey, vote,
              or measure of sentiment. Repetition here reflects overlapping screenshots, not
              prevalence.
            </p>
            <p className="mt-2 text-(--color-faq-ink-faint)">
              Prototype use was authorised; wider publication remains a team check.
            </p>
          </div>
        </div>

        <ul
          aria-label="Anonymous event signal screenshots"
          className="-mx-5 mt-6 flex snap-x gap-3 overflow-x-auto px-5 pb-3 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0"
        >
          {eventSignals.map((asset, index) => (
            <li
              key={asset.id}
              className="w-[min(76vw,13rem)] shrink-0 snap-start rounded-2xl border border-(--color-faq-line) bg-(--color-faq-paper) p-3"
            >
              <figure>
                <a
                  href={asset.publicPath}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open event signal ${index + 1} at full size`}
                  className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-faq-paper)"
                >
                  <img
                    src={asset.publicPath}
                    width={asset.width}
                    height={asset.height}
                    alt={asset.alt}
                    loading="lazy"
                    decoding="async"
                    data-testid="faq-signal-image"
                    className="h-44 w-full rounded-xl bg-(--color-faq-surface) object-contain image-outline"
                  />
                </a>
                <figcaption className="mt-3 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-(--color-faq-ink-faint)">
                  <span>Event signal {String(index + 1).padStart(2, '0')}</span>
                  <span>Team check</span>
                </figcaption>
              </figure>
              <details className="mt-3 border-t border-(--color-faq-line) pt-2 text-xs text-(--color-faq-ink-soft)">
                <summary className="cursor-pointer rounded-sm py-1 font-semibold text-(--color-faq-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)">
                  Read transcript
                </summary>
                <p className="mt-2 leading-relaxed">{asset.transcript}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
