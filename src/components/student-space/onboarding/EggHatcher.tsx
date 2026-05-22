import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EGG_COLOR_BY_ID,
  EGG_COLORS,
  ONBOARDING_COPY,
} from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { cn } from '~/lib/utils'

/**
 * Egg color, companion name, and hatch stage for the React onboarding flow.
 *
 * The original surface used a small Three.js egg canvas. The live world
 * scene still stays engine-owned; this React surface keeps the same state
 * writes and timing while expressing the ceremony UI in Tailwind.
 */
const HATCH_MS = 1400

type OnboardingSlice = {
  stage?: string
  eggColorId?: string | null
  companionName?: string | null
  setEggColor?: (id: string) => unknown
  setCompanionName?: (name: string) => unknown
}

type ProfileSlice = {
  setIdentity?: (identity: { companionSpecies: string; companionName: string }) => unknown
}

type KiraLike = {
  setSpecies?: (id: string) => unknown
}

export function EggHatcher({
  stage,
  reducedMotion,
  onboarding,
  profile,
  kira,
  onAdvance,
}: {
  stage: 'egg-color' | 'egg-name' | 'egg-hatch'
  reducedMotion: boolean
  onboarding: OnboardingSlice | null | undefined
  profile: ProfileSlice | null | undefined
  kira: KiraLike | null | undefined
  onAdvance: (next: string) => void
}) {
  const initialColor = onboarding?.eggColorId ?? EGG_COLORS[0]?.id ?? 'flame'
  const [selectedColor, setSelectedColor] = useState<string>(initialColor)
  const [name, setName] = useState(onboarding?.companionName ?? '')
  const [visible, setVisible] = useState(reducedMotion)
  const colorButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const selected = EGG_COLOR_BY_ID[selectedColor] ?? EGG_COLORS[0]
  const trimmedName = name.trim()
  const hatchColor = selected?.hex ?? '#E63946'

  useEffect(() => {
    if (reducedMotion) return
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [reducedMotion])

  useEffect(() => {
    if (stage !== 'egg-hatch') return
    const id = window.setTimeout(() => onAdvance('first-chat'), reducedMotion ? 160 : HATCH_MS)
    return () => window.clearTimeout(id)
  }, [onAdvance, reducedMotion, stage])

  useEffect(() => {
    if (stage !== 'egg-color') return
    const id = window.setTimeout(() => {
      const button = colorButtonRefs.current.get(selectedColor)
      button?.focus({ preventScroll: true })
    }, 60)
    return () => window.clearTimeout(id)
  }, [selectedColor, stage])

  const swatches = useMemo(() => EGG_COLORS, [])

  const commitColor = () => {
    onboarding?.setEggColor?.(selectedColor)
    onAdvance('egg-name')
  }

  const commitName = () => {
    if (!trimmedName) return
    onboarding?.setCompanionName?.(trimmedName)
    const species = onboarding?.eggColorId || selectedColor
    profile?.setIdentity?.({ companionSpecies: species, companionName: trimmedName })
    kira?.setSpecies?.(species)
    onAdvance('egg-hatch')
  }

  return (
    <div
      data-testid="onboarding-egg"
      data-stage={stage}
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-7',
        'bg-(--color-onb-bg-cream) px-6 py-[max(2rem,env(safe-area-inset-bottom))] text-(--color-onb-ink)',
        'transition-opacity duration-[320ms] ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {stage === 'egg-color' ? (
        <section className="flex w-full max-w-[420px] flex-col items-center gap-5 text-center">
          <EggPreview color={hatchColor} state="idle" />
          <div>
            <h2 className="m-0 text-xl font-semibold">{ONBOARDING_COPY.eggColor.title}</h2>
            <p className="mt-2 mb-0 text-sm text-(--color-onb-ink-soft)">
              {ONBOARDING_COPY.eggColor.sub}
            </p>
          </div>
          <fieldset className="m-0 grid w-full grid-cols-3 gap-3 border-0 p-0">
            <legend className="sr-only">{ONBOARDING_COPY.eggColor.title}</legend>
            {swatches.map((color) => {
              const picked = color.id === selectedColor
              return (
                <button
                  key={color.id}
                  ref={(node) => {
                    if (node) colorButtonRefs.current.set(color.id, node)
                    else colorButtonRefs.current.delete(color.id)
                  }}
                  type="button"
                  aria-pressed={picked}
                  aria-label={ONBOARDING_COPY.eggColor.swatchAria.replace(
                    '{colorName}',
                    color.name,
                  )}
                  data-testid={`egg-color-${color.id}`}
                  onClick={() => setSelectedColor(color.id)}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-white/70',
                    'text-xs font-semibold text-(--color-onb-ink) shadow-[0_8px_20px_rgba(15,18,36,0.10)]',
                    'transition-[transform,border-color,background] duration-150 hover:-translate-y-px hover:bg-white',
                    'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
                    picked ? 'border-(--color-onb-accent) bg-white' : 'border-transparent',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-7 rounded-full shadow-inner"
                    style={{ background: color.hex }}
                  />
                  {color.name}
                </button>
              )
            })}
          </fieldset>
          <button
            type="button"
            onClick={commitColor}
            className="min-h-12 rounded-2xl bg-(--color-onb-accent) px-8 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,138,92,0.30)] transition-transform duration-150 hover:-translate-y-px focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]"
          >
            {ONBOARDING_COPY.eggColor.cta}
          </button>
        </section>
      ) : null}

      {stage === 'egg-name' ? (
        <section className="flex w-full max-w-[420px] flex-col items-center gap-5 text-center">
          <EggPreview color={hatchColor} state="idle" />
          <div>
            <h2 className="m-0 text-xl font-semibold">{ONBOARDING_COPY.eggName.title}</h2>
            <p className="mt-2 mb-0 text-sm text-(--color-onb-ink-soft)">
              {ONBOARDING_COPY.eggName.sub}
            </p>
          </div>
          <input
            value={name}
            maxLength={16}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder={ONBOARDING_COPY.eggName.placeholder}
            aria-label={ONBOARDING_COPY.eggName.title}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitName()
              }
            }}
            className="min-h-12 w-full rounded-2xl border border-[rgba(43,38,32,0.12)] bg-white/80 px-4 text-center text-base font-semibold text-(--color-onb-ink) shadow-[0_8px_20px_rgba(15,18,36,0.10)] outline-none focus:border-(--color-onb-accent)"
          />
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => onAdvance('egg-color')}
              className="min-h-11 rounded-2xl border border-[rgba(43,38,32,0.12)] bg-white/70 px-5 text-sm font-semibold text-(--color-onb-ink) transition-transform duration-150 hover:-translate-y-px hover:bg-white focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]"
            >
              {ONBOARDING_COPY.eggName.back}
            </button>
            <button
              type="button"
              disabled={!trimmedName}
              onClick={commitName}
              className="min-h-11 rounded-2xl bg-(--color-onb-accent) px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,138,92,0.30)] transition-[transform,opacity] duration-150 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]"
            >
              {ONBOARDING_COPY.eggName.cta}
            </button>
          </div>
        </section>
      ) : null}

      {stage === 'egg-hatch' ? (
        <section
          className="flex w-full max-w-[420px] flex-col items-center gap-6 text-center"
          aria-live="polite"
        >
          <EggPreview color={hatchColor} state="hatching" />
          <p className="m-0 text-sm font-medium text-(--color-onb-ink-soft)">
            {ONBOARDING_COPY.eggHatch.a11yNarration}
          </p>
        </section>
      ) : null}
    </div>
  )
}

function EggPreview({ color, state }: { color: string; state: 'idle' | 'hatching' }) {
  return (
    <div className="relative grid h-48 w-40 place-items-center" aria-hidden="true">
      <div className="absolute bottom-3 h-4 w-24 rounded-full bg-[rgba(43,38,32,0.10)] blur-sm" />
      <div
        className={cn(
          'relative h-32 w-24 rounded-[50%_50%_44%_44%/58%_58%_42%_42%]',
          'shadow-[inset_-18px_-26px_34px_rgba(43,38,32,0.18),inset_12px_16px_24px_rgba(255,255,255,0.42),0_18px_36px_rgba(15,18,36,0.18)]',
          state === 'hatching' && 'animate-pulse',
        )}
        style={{ background: color }}
      >
        {state === 'hatching' ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-16 w-16 rounded-full bg-white/75 shadow-[0_0_44px_rgba(255,255,255,0.95)]" />
            <div className="absolute size-3 rounded-full bg-(--color-onb-ink)" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
