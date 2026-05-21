import { Link } from '@tanstack/react-router'
import { Library as LibraryIcon, Mic } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export interface WorldHudProps {
  /** Whether sheet/library nav should be disabled (e.g., during voice mode). */
  voiceModeActive?: boolean
  /** Called when the Voice button is tapped — wired by U5's MirrorSession. */
  onVoicePressed?: () => void
  /** Optional slot rendered alongside the Voice button (e.g., U5's voice halo). */
  voiceSlot?: ReactNode
}

/**
 * HUD layer rendered on top of WorldStage. Voice button bottom-center
 * (placeholder this plan — U5 replaces with the dedicated VoiceButton
 * component), Library button bottom-right.
 *
 * The chat input bar, Studio pill, and "Only you" indicator were dropped
 * and are intentionally absent.
 */
export function WorldHud({ voiceModeActive = false, onVoicePressed, voiceSlot }: WorldHudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="mt-auto flex items-end justify-between gap-3 p-4">
        <div className="flex-1" />
        <div className="pointer-events-auto flex items-center justify-center">
          {voiceSlot ?? (
            <Button
              type="button"
              size="icon"
              variant="accent"
              aria-label="Start voice"
              onClick={onVoicePressed}
              disabled={!onVoicePressed}
              data-testid="voice-button"
              className={cn('h-14 w-14 rounded-full shadow-lg')}
            >
              <Mic aria-hidden className="h-6 w-6" />
            </Button>
          )}
        </div>
        <div className="flex flex-1 justify-end">
          <Link
            to="/history"
            aria-label="Library"
            aria-disabled={voiceModeActive || undefined}
            onClick={
              voiceModeActive ? (e: MouseEvent<HTMLAnchorElement>) => e.preventDefault() : undefined
            }
            data-testid="library-button"
            className={cn(
              'pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted',
              voiceModeActive ? 'cursor-not-allowed opacity-50' : null,
            )}
          >
            <LibraryIcon aria-hidden className="h-4 w-4" />
            Library
          </Link>
        </div>
      </div>
    </div>
  )
}
