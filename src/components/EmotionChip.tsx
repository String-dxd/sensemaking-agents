/**
 * U6 — Read-only chip used in two places:
 *  - In-session affordance during voice mode (will be wired in a follow-
 *    up once the mood overlay is live in MirrorSession's render).
 *  - Post-Mirror review's "what Mirror sensed" block — `variant="inferred"`
 *    renders Mirror's read; `variant="user"` renders the student's
 *    optional self-tag. When both are shown, the connector line reads
 *    `same`, `aligned`, or `different` based on a small neighbor-group
 *    lookup.
 */

import type { Mood } from '~/agents/tools/schemas'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

const MOOD_LABEL: Record<Mood, string> = {
  joy: 'Joy',
  sadness: 'Sadness',
  anger: 'Anger',
  fear: 'Fear',
  disgust: 'Disgust',
  anxiety: 'Anxiety',
  envy: 'Envy',
  embarrassed: 'Embarrassed',
  ennui: 'Ennui',
}

/** Pairs of moods that are emotionally adjacent rather than identical. */
const NEIGHBOR_GROUPS: Mood[][] = [
  ['sadness', 'ennui'],
  ['sadness', 'embarrassed'],
  ['anger', 'disgust'],
  ['fear', 'anxiety'],
  ['envy', 'anger'],
]

export type EmotionChipVariant = 'inferred' | 'user'

export interface EmotionChipProps {
  mood: Mood
  variant: EmotionChipVariant
  onClick?: () => void
  /** When supplied, render as a small clickable button (in-session use). */
  asButton?: boolean
}

export function EmotionChip({ mood, variant, onClick, asButton = false }: EmotionChipProps) {
  const eyebrow = variant === 'inferred' ? 'Mirror sensed' : 'You felt'
  const badgeVariant = variant === 'inferred' ? 'secondary' : 'accent'

  const content = (
    <>
      <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{eyebrow}</span>
      <span className="text-sm font-medium">{MOOD_LABEL[mood]}</span>
    </>
  )

  if (asButton) {
    const palette =
      variant === 'inferred'
        ? 'bg-muted text-muted-foreground'
        : 'bg-accent/15 text-accent border border-accent/30'
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        data-testid={`emotion-chip-${variant}`}
        data-mood={mood}
        className={cn('inline-flex h-auto items-center gap-2 rounded-full px-3 py-1.5', palette)}
      >
        {content}
      </Button>
    )
  }

  return (
    <Badge
      variant={badgeVariant}
      className="px-3 py-1.5"
      data-testid={`emotion-chip-${variant}`}
      data-mood={mood}
    >
      {content}
    </Badge>
  )
}

export type EmotionConnectorVerdict = 'same' | 'aligned' | 'different'

export function emotionConnectorVerdict(inferred: Mood, user: Mood): EmotionConnectorVerdict {
  if (inferred === user) return 'same'
  const inNeighborGroup = NEIGHBOR_GROUPS.some(
    (group) => group.includes(inferred) && group.includes(user),
  )
  return inNeighborGroup ? 'aligned' : 'different'
}

export interface EmotionConnectorProps {
  inferred: Mood
  user: Mood
}

export function EmotionConnector({ inferred, user }: EmotionConnectorProps) {
  const verdict = emotionConnectorVerdict(inferred, user)
  const copy =
    verdict === 'same' ? 'same read' : verdict === 'aligned' ? 'aligned reads' : 'different reads'
  return (
    <span
      data-testid="emotion-connector"
      data-verdict={verdict}
      className="text-xs italic text-muted-foreground"
    >
      {copy}
    </span>
  )
}
