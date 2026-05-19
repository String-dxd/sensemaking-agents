import { useEffect, useMemo, useState } from 'react'
import type { Game } from '~/engine/student-space/Game'
// @ts-expect-error — vipsTaxonomy.js is JS without a companion .d.ts.
import { VIPS_BY_FACET } from '~/engine/student-space/Game/Data/vipsTaxonomy.js'

/**
 * Phase B of the species-from-content rule — a two-step picker that
 * appears after each capture submit.
 *
 * Step 1: pick a top-level lens — Value, Interest, Personality, or Skill.
 *   - Drives the sprout's species (Tree / Flower / WindStone+Pool / Fruit).
 *   - Flows to:
 *     • `captures.patch(id, { dimension })`
 *     • `sprouts.setDimensionForFirstCapture(id, dimension)`
 *
 * Step 2: pick a finer-grained sub-claim from `VIPS_BY_FACET[dimension]`.
 *   - Optional. Student can skip and stay coarse.
 *   - Stored as `subClaimId` on the capture entry for future analysis + display.
 *   - Does NOT change sprout species.
 *
 * UX rules:
 *   - Only shows when a brand-new capture arrives WITHOUT a dimension.
 *     A `patch` re-fire of the same entry (now WITH a dimension) is ignored.
 *   - Rapid-fire submissions queue. One picker at a time; the next opens
 *     when the current one resolves.
 *   - Mood pins are auto-tagged in `wireSproutsToCaptures` (mood → personality)
 *     and don't trigger this picker.
 *   - Defensive against partial game objects (tests, mid-init).
 */

const CHIPS: Array<{ id: Dimension; label: string; hint: string }> = [
  { id: 'values', label: 'Value', hint: 'Something you care about' },
  { id: 'interests', label: 'Interest', hint: 'Something that caught you' },
  { id: 'personality', label: 'Personality', hint: 'How you tend to be' },
  { id: 'skills', label: 'Skill', hint: 'Something you are learning' },
]

type Dimension = 'values' | 'interests' | 'personality' | 'skills'

type SubClaim = {
  id: string
  facet: Dimension
  label: string
  definition: string
}

function getCapturesSlice(game: Game) {
  const state = (
    game as unknown as {
      state?: {
        captures?: {
          subscribe?(cb: (entry: { id: string; dimension?: string | null }) => void): () => void
          patch?(
            id: string,
            updates: { dimension?: Dimension; subClaimId?: string | null },
          ): unknown
        }
      }
    }
  ).state
  return state?.captures ?? null
}

function getSproutsSlice(game: Game) {
  const state = (
    game as unknown as {
      state?: {
        sprouts?: {
          setDimensionForFirstCapture?(id: string, dimension: Dimension): boolean
        }
      }
    }
  ).state
  return state?.sprouts ?? null
}

export function CaptureTagPicker({ game }: { game: Game }) {
  const [queue, setQueue] = useState<string[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [step, setStep] = useState<'dimension' | 'subClaim'>('dimension')
  const [chosenDimension, setChosenDimension] = useState<Dimension | null>(null)

  useEffect(() => {
    const captures = getCapturesSlice(game)
    if (!captures?.subscribe) return
    return captures.subscribe((entry) => {
      if (entry.dimension) return
      setQueue((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]))
    })
  }, [game])

  useEffect(() => {
    if (current === null && queue.length > 0) {
      const next = queue[0]
      if (!next) return
      setCurrent(next)
      setStep('dimension')
      setChosenDimension(null)
      setQueue((q) => q.slice(1))
    }
  }, [current, queue])

  const subClaims: SubClaim[] = useMemo(() => {
    if (!chosenDimension) return []
    return (VIPS_BY_FACET as Record<string, SubClaim[]>)[chosenDimension] ?? []
  }, [chosenDimension])

  const finish = (dimension: Dimension, subClaimId: string | null) => {
    const id = current
    if (!id) return
    const captures = getCapturesSlice(game)
    const sprouts = getSproutsSlice(game)
    try {
      captures?.patch?.(id, subClaimId ? { dimension, subClaimId } : { dimension })
    } catch (err) {
      console.warn('[capture-tag-picker] patch failed', err)
    }
    try {
      sprouts?.setDimensionForFirstCapture?.(id, dimension)
    } catch (err) {
      console.warn('[capture-tag-picker] sprouts dimension failed', err)
    }
    setCurrent(null)
    setChosenDimension(null)
    setStep('dimension')
  }

  const handlePickDimension = (dimension: Dimension) => {
    // If the facet has 0 or 1 sub-claims, the second step would be pointless.
    // VIPS_BY_FACET always returns ≥2 today, but guard defensively.
    const subs = (VIPS_BY_FACET as Record<string, SubClaim[]>)[dimension] ?? []
    if (subs.length <= 1) {
      finish(dimension, subs[0]?.id ?? null)
      return
    }
    setChosenDimension(dimension)
    setStep('subClaim')
  }

  const handlePickSubClaim = (id: string) => {
    if (!chosenDimension) return
    finish(chosenDimension, id)
  }

  const handleSkipSubClaim = () => {
    if (!chosenDimension) return
    finish(chosenDimension, null)
  }

  if (!current) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-tag-picker-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        background: 'rgba(0, 0, 0, 0.32)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
      data-capture-tag-picker
      data-step={step}
    >
      <div
        style={{
          maxWidth: 'min(94vw, 460px)',
          width: '100%',
          margin: '0 12px calc(env(safe-area-inset-bottom, 0px) + 24px)',
          padding: '20px 18px 18px',
          background: '#FFFBE6',
          borderRadius: 18,
          boxShadow: '0 8px 28px rgba(0, 0, 0, 0.22)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {step === 'dimension' && <DimensionStep onPick={handlePickDimension} />}
        {step === 'subClaim' && chosenDimension && (
          <SubClaimStep
            dimension={chosenDimension}
            subClaims={subClaims}
            onPick={handlePickSubClaim}
            onSkip={handleSkipSubClaim}
          />
        )}
      </div>
    </div>
  )
}

function DimensionStep({ onPick }: { onPick: (d: Dimension) => void }) {
  return (
    <>
      <h2
        id="capture-tag-picker-title"
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: '#1a3a14',
          lineHeight: 1.3,
        }}
      >
        What is this about?
      </h2>
      <p
        style={{
          margin: '4px 0 14px',
          fontSize: 12,
          color: '#4a5b3f',
        }}
      >
        Pick the lens that fits — this shapes what grows on the island.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {CHIPS.map((chip) => (
          <button key={chip.id} type="button" onClick={() => onPick(chip.id)} style={chipStyle}>
            <div>{chip.label}</div>
            <div style={chipHintStyle}>{chip.hint}</div>
          </button>
        ))}
      </div>
    </>
  )
}

function SubClaimStep({
  dimension,
  subClaims,
  onPick,
  onSkip,
}: {
  dimension: Dimension
  subClaims: SubClaim[]
  onPick: (id: string) => void
  onSkip: () => void
}) {
  return (
    <>
      <h2
        id="capture-tag-picker-title"
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: '#1a3a14',
          lineHeight: 1.3,
        }}
      >
        Which {dimensionWord(dimension)}?
      </h2>
      <p
        style={{
          margin: '4px 0 14px',
          fontSize: 12,
          color: '#4a5b3f',
        }}
      >
        Optional — pick a finer label, or skip to stay general.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          maxHeight: '50vh',
          overflowY: 'auto',
        }}
      >
        {subClaims.map((sub) => (
          <button
            key={sub.id}
            type="button"
            onClick={() => onPick(sub.id)}
            style={chipStyle}
            title={sub.definition}
          >
            <div>{sub.label}</div>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        data-skip-subclaim
        style={{
          marginTop: 12,
          width: '100%',
          padding: '8px',
          background: 'transparent',
          border: 'none',
          color: '#4a5b3f',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Skip — keep it general
      </button>
    </>
  )
}

function dimensionWord(d: Dimension): string {
  switch (d) {
    case 'values':
      return 'value'
    case 'interests':
      return 'interest'
    case 'personality':
      return 'personality trait'
    case 'skills':
      return 'skill'
  }
}

const chipStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(28, 58, 20, 0.06)',
  border: '1px solid rgba(28, 58, 20, 0.18)',
  color: '#1a3a14',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  textAlign: 'left',
  cursor: 'pointer',
  lineHeight: 1.2,
}

const chipHintStyle: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  fontWeight: 400,
  color: '#4a5b3f',
}
