import './panel.css'
import { CHARACTER_CLIPS, type ClipSelection } from '../models/characterAsset'
import { IconButton } from './icons'

interface AnimationDockProps {
  clip: ClipSelection
  onPrev: () => void
  onNext: () => void
}

// Reuses the chevron shapes from RotateLeft/RightIcon's spirit but as plain
// arrows — simplest glyphs for a prev/next pair, no need for a new svgProps
// variant.
function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

/** Bottom-center dock, shown only while a character is placed: cycles the
 *  animation clip it plays. Sits directly above the hotbar (see
 *  `.animation-dock` in panel.css). */
export function AnimationDock({ clip, onPrev, onNext }: AnimationDockProps) {
  // 'Auto' = the plan-025 behavior machine; concrete clips are the manual
  // override. The cycle is ['auto', ...CHARACTER_CLIPS] (11 entries).
  const label = clip === 'auto' ? 'Auto' : clip.replace(/_/g, ' ')
  // 1-based position in the cycling order, so the dock also reads as a
  // progress indicator (e.g. "1 / 11" for Auto) rather than just a bare name.
  const cycleLength = CHARACTER_CLIPS.length + 1
  const position = clip === 'auto' ? 1 : CHARACTER_CLIPS.indexOf(clip) + 2
  return (
    <div className="animation-dock">
      <div className="animation-dock__row">
        <IconButton title="Previous animation" onClick={onPrev}>
          <PrevIcon />
        </IconButton>
        <span className="animation-dock__label">
          {label}
          <span className="animation-dock__index">
            {position} / {cycleLength}
          </span>
        </span>
        <IconButton title="Next animation" onClick={onNext}>
          <NextIcon />
        </IconButton>
      </div>
    </div>
  )
}
