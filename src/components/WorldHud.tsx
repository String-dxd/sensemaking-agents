import { Mic } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export interface WorldHudProps {
  /** Whether capture/nav should be disabled (e.g., during voice mode). */
  voiceModeActive?: boolean
  /** Called when the Voice button is tapped — wired by U5's MirrorSession. */
  onVoicePressed?: () => void
  /** Legacy optional slot for the primary capture action. */
  voiceSlot?: ReactNode
  /** Optional slot rendered as the floating capture action. */
  captureSlot?: ReactNode
}

/**
 * HUD layer rendered on top of WorldStage. Navigation now lives in
 * FloatingWorldActions; this component owns only the capture corner.
 */
export function WorldHud({
  voiceModeActive = false,
  onVoicePressed,
  voiceSlot,
  captureSlot,
}: WorldHudProps) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
        {captureSlot ?? voiceSlot ?? (
          <div className="pointer-events-auto">
            <Button
              type="button"
              size="icon"
              variant="accent"
              aria-label="Start voice"
              onClick={onVoicePressed}
              disabled={!onVoicePressed || voiceModeActive}
              data-testid="voice-button"
              className={cn('h-14 w-14 rounded-full shadow-lg')}
            >
              <Mic aria-hidden className="h-6 w-6" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
