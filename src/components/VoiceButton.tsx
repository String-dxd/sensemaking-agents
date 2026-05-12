import { Mic, Square } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export type VoiceButtonPhase = 'idle' | 'recording' | 'working' | 'disabled'

export interface VoiceButtonProps {
  phase: VoiceButtonPhase
  /** Smoothed RMS amplitude [0..1] driving the volume halo during recording. */
  amplitude?: number
  onPress?: () => void
}

/**
 * Primary capture affordance. Three visual states:
 *  - `idle` — mic icon, tap to start
 *  - `recording` — stop icon with a volume-reactive halo
 *  - `working` — disabled while transcribing → reflecting → persisting
 *
 * The same button slot in WorldHud (bottom-center) renders this component;
 * the halo replaces v0.1's ring-around-the-video and IS the recording
 * feedback now that there's no camera frame.
 */
export function VoiceButton({ phase, amplitude = 0, onPress }: VoiceButtonProps) {
  const isRecording = phase === 'recording'
  const disabled = phase === 'working' || phase === 'disabled' || !onPress
  // Halo scale: 1.0 baseline, +18% at full amplitude.
  const haloScale = 1 + Math.min(1, Math.max(0, amplitude)) * 0.18
  return (
    <div className="relative" data-testid="voice-button-wrapper">
      {isRecording ? (
        <span
          aria-hidden
          data-testid="voice-button-halo"
          className="pointer-events-none absolute inset-0 -m-2 rounded-full bg-accent/25 transition-transform duration-100 ease-out"
          style={{ transform: `scale(${haloScale})` }}
        />
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="accent"
        onClick={onPress}
        disabled={disabled}
        aria-label={isRecording ? 'Stop recording' : 'Start voice'}
        data-testid="voice-button"
        data-phase={phase}
        className={cn('relative h-14 w-14 rounded-full shadow-lg')}
      >
        {isRecording ? (
          <Square aria-hidden className="h-5 w-5" />
        ) : (
          <Mic aria-hidden className="h-6 w-6" />
        )}
      </Button>
    </div>
  )
}
