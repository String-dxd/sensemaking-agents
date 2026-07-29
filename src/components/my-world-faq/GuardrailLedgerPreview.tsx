import { FAQ_GUARDRAILS, type FaqGuardrailState } from '~/data/my-world-faq'

const PREVIEW = [
  {
    state: 'built-today',
    label: 'Built today',
    description: 'Repository-verified behaviour, not proof of safety or efficacy.',
    guardrailId: 'review-log-forget-controls',
  },
  {
    state: 'required-before-pilot',
    label: 'Required before any pilot',
    description: 'A deployment and governance condition, not future reassurance.',
    guardrailId: 'distress-human-escalation',
  },
  {
    state: 'still-researching',
    label: 'Still researching',
    description: 'An outcome the team does not know and evidence must be allowed to challenge.',
    guardrailId: 'family-peer-displacement',
  },
] as const satisfies ReadonlyArray<{
  state: FaqGuardrailState
  label: string
  description: string
  guardrailId: string
}>

export function GuardrailLedgerPreview() {
  return (
    <section
      aria-labelledby="guardrail-preview-title"
      className="border-b border-(--color-faq-line-strong) bg-(--color-faq-surface)"
      data-testid="faq-guardrail-preview"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="grid gap-7 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold text-(--color-faq-coral-ink)">Guardrail ledger</p>
            <h2
              id="guardrail-preview-title"
              className="mt-3 max-w-3xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em]"
            >
              Keep the states separate.
            </h2>
          </div>
          <p className="max-w-[50ch] text-sm leading-relaxed text-(--color-faq-ink-soft) lg:col-span-5 lg:justify-self-end">
            What exists now, what a pilot would require, and what still needs evidence.
          </p>
        </div>

        <div className="mt-12 border-y border-(--color-faq-ink)">
          {PREVIEW.map((preview, index) => {
            const guardrail = FAQ_GUARDRAILS.find((item) => item.id === preview.guardrailId)
            if (!guardrail) return null
            return (
              <article
                key={preview.state}
                className="faq-ledger-row grid gap-6 border-b border-(--color-faq-ink) px-5 py-7 last:border-b-0 sm:px-7 lg:grid-cols-12 lg:items-start"
                data-state={preview.state}
              >
                <div className="flex items-center gap-4 lg:col-span-3">
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-full border border-(--color-faq-ink) text-xs font-semibold tabular-nums"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{preview.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-(--color-faq-ink-soft)">
                      {preview.description}
                    </p>
                  </div>
                </div>
                <div className="lg:col-span-4">
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">{guardrail.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                    {guardrail.statusSummary}
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-(--color-faq-ink-soft) lg:col-span-5 lg:pl-8">
                  <span className="font-semibold text-(--color-faq-ink)">{guardrail.label}.</span>{' '}
                  {guardrail.limitations}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
