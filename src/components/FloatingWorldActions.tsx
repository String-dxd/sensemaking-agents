import { Link } from '@tanstack/react-router'
import { Compass, Library, UserRound } from 'lucide-react'
import type { MouseEvent } from 'react'
import { cn } from '~/lib/utils'

export interface FloatingWorldActionsProps {
  voiceModeActive?: boolean
}

export function FloatingWorldActions({ voiceModeActive = false }: FloatingWorldActionsProps) {
  const blockIfVoiceMode = (event: MouseEvent<HTMLAnchorElement>) => {
    if (voiceModeActive) event.preventDefault()
  }

  const disabledClasses = voiceModeActive ? 'cursor-not-allowed opacity-50' : null

  return (
    <nav
      aria-label="World navigation"
      className="pointer-events-none absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-3"
      data-testid="floating-world-actions"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/70 bg-background/82 p-1 shadow-sm backdrop-blur">
        <Link
          to="/library"
          aria-label="Open library"
          aria-disabled={voiceModeActive || undefined}
          onClick={blockIfVoiceMode}
          className={cn(worldActionClassName, disabledClasses)}
          data-testid="floating-action-library"
        >
          <Library aria-hidden className="h-4 w-4" />
          <span className="sr-only">Library</span>
        </Link>
        <Link
          to="/library/trajectory"
          aria-label="Open trajectory compass"
          aria-disabled={voiceModeActive || undefined}
          onClick={blockIfVoiceMode}
          className={cn(worldActionClassName, disabledClasses)}
          data-testid="floating-action-compass"
        >
          <Compass aria-hidden className="h-4 w-4" />
          <span className="sr-only">Trajectory compass</span>
        </Link>
      </div>
      <Link
        to="/me"
        aria-label="Open profile"
        aria-disabled={voiceModeActive || undefined}
        onClick={blockIfVoiceMode}
        className={cn(
          'pointer-events-auto rounded-full border border-white/70 bg-background/82 p-2.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          disabledClasses,
        )}
        data-testid="floating-action-profile"
      >
        <UserRound aria-hidden className="h-4 w-4" />
        <span className="sr-only">Profile</span>
      </Link>
    </nav>
  )
}

const worldActionClassName =
  'inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
