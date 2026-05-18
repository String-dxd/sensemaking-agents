import { useEffect, useState } from 'react'
import type { Game } from '~/engine/student-space/Game'

/**
 * Phase B of the species-from-content rule — a small modal that appears
 * after each capture submit and asks the student to pick what the capture
 * is *about*: Value, Interest, Personality, or Skill.
 *
 * The pick flows to two places:
 *   1. `captures.patch(id, { dimension })` — recorded on the capture entry
 *   2. `sprouts.setDimensionForFirstCapture(id, dimension)` — locks the
 *      sprout's species if this was its first capture
 *
 * UX rules:
 *   - Only shows when a brand-new capture arrives WITHOUT a dimension.
 *     A `patch` re-fire of the same entry (now WITH a dimension) is
 *     ignored.
 *   - Rapid-fire submissions queue. One picker at a time; the next
 *     opens when the current one resolves.
 *   - No skip / dismiss in v1. The student must pick. (If this proves
 *     too sticky in dogfooding, add a "Not sure" affordance that defaults
 *     to 'personality'.)
 *   - Mood pins are auto-tagged in `wireSproutsToCaptures` (mood is
 *     inherently emotional state, which maps to personality). They
 *     don't trigger this picker.
 *   - Defensive against partial game objects (tests, mid-init).
 */

const CHIPS: Array<{ id: 'values' | 'interests' | 'personality' | 'skills'; label: string; hint: string }> = [
  { id: 'values',      label: 'Value',       hint: 'Something you care about' },
  { id: 'interests',   label: 'Interest',    hint: 'Something that caught you' },
  { id: 'personality', label: 'Personality', hint: 'How you tend to be' },
  { id: 'skills',      label: 'Skill',       hint: 'Something you are learning' },
]

type Dimension = (typeof CHIPS)[number]['id']

function getCapturesSlice(game: Game) {
  const state = (
    game as unknown as {
      state?: {
        captures?: {
          subscribe?(cb: (entry: { id: string; dimension?: string | null }) => void): () => void
          patch?(id: string, updates: { dimension: Dimension }): unknown
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

  // Subscribe to captures.add — enqueue untagged entries.
  useEffect(() => {
    const captures = getCapturesSlice(game)
    if (!captures?.subscribe) return
    return captures.subscribe((entry) => {
      // A patch re-fire arrives with the dimension already set; ignore.
      if (entry.dimension) return
      setQueue((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]))
    })
  }, [game])

  // Pop the next id from the queue when no picker is active.
  useEffect(() => {
    if (current === null && queue.length > 0) {
      setCurrent(queue[0]!)
      setQueue((q) => q.slice(1))
    }
  }, [current, queue])

  const handlePick = (dimension: Dimension) => {
    const id = current
    if (!id) return
    const captures = getCapturesSlice(game)
    const sprouts = getSproutsSlice(game)
    try {
      captures?.patch?.(id, { dimension })
    } catch (err) {
      console.warn('[capture-tag-picker] patch failed', err)
    }
    try {
      sprouts?.setDimensionForFirstCapture?.(id, dimension)
    } catch (err) {
      console.warn('[capture-tag-picker] sprouts dimension failed', err)
    }
    setCurrent(null)
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
            <button
              key={chip.id}
              type="button"
              onClick={() => handlePick(chip.id)}
              style={{
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
              }}
            >
              <div>{chip.label}</div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 11,
                  fontWeight: 400,
                  color: '#4a5b3f',
                }}
              >
                {chip.hint}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
