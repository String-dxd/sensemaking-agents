import { FAQ_GUARDRAILS, type FaqGuardrailState } from '~/data/my-world-faq'

const PREVIEW = [
  {
    state: 'built-today',
    label: 'Built today',
    description: 'Repository-verified behavior—not proof of safety or efficacy.',
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
      className="border-b border-(--color-faq-line) bg-(--color-faq-surface)"
      data-testid="faq-guardrail-preview"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 lg:px-10 lg:py-18">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-faq-ink-faint)">
              Guardrail ledger · preview
            </p>
            <h2
              id="guardrail-preview-title"
              className="mt-3 text-[clamp(1.7rem,3.5vw,2.6rem)] font-semibold leading-tight tracking-[-0.04em]"
            >
              Three states that cannot be blurred
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-(--color-faq-ink-soft)">
            One example from each state is shown here for the checkpoint. “Built today” describes
            inspected behavior. It does not promote an item from “before pilot” or answer a
            long-term research question.
          </p>
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-3xl border border-(--color-faq-line) bg-(--color-faq-line) md:grid-cols-3">
          {PREVIEW.map((preview) => {
            const guardrail = FAQ_GUARDRAILS.find((item) => item.id === preview.guardrailId)
            if (!guardrail) return null
            return (
              <article key={preview.state} className="bg-(--color-faq-paper) p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-(--color-faq-stage-ink)">
                  {preview.label}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-(--color-faq-ink-faint)">
                  {preview.description}
                </p>
                <h3 className="mt-6 text-lg font-semibold tracking-[-0.025em]">
                  {guardrail.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                  {guardrail.statusSummary}
                </p>
                <p className="mt-4 border-t border-(--color-faq-line) pt-3 text-xs leading-relaxed text-(--color-faq-ink-faint)">
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
