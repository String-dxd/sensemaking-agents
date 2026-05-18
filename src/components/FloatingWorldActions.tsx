import { Compass, UserRound } from 'lucide-react'
import { FloatingAgentDebugPanel } from '~/components/AgentDebugPanel'
import type { FloatingAuthMenuState } from '~/components/ProfileSheetChrome'
import { cn } from '~/lib/utils'

// `FloatingAuthMenuState` has moved to `ProfileSheetChrome` (the live module
// that consumes it). Re-exported here so any existing import keeps working
// while the dormant `FloatingWorldActions` component is on its eventual
// deletion path.
export type { FloatingAuthMenuState } from '~/components/ProfileSheetChrome'

export interface FloatingWorldActionsProps {
  authMenu?: FloatingAuthMenuState
  onOpenProfile?: () => void
  onOpenTrajectory?: () => void
  profileOpen?: boolean
  sheetPanelId?: string
  showAgentDebug?: boolean
  trajectoryOpen?: boolean
  voiceModeActive?: boolean
}

export function FloatingWorldActions({
  authMenu = { status: 'signed-out' },
  onOpenProfile,
  onOpenTrajectory,
  profileOpen = false,
  sheetPanelId,
  showAgentDebug = import.meta.env.DEV,
  trajectoryOpen = false,
  voiceModeActive = false,
}: FloatingWorldActionsProps) {
  const disabledClasses = voiceModeActive ? 'cursor-not-allowed opacity-50' : null

  return (
    <nav
      aria-label="World navigation"
      className="pointer-events-none z-20 flex items-start justify-between gap-3 px-4"
      data-testid="floating-world-actions"
    >
      <div className="pointer-events-auto flex items-start gap-2">
        {showAgentDebug ? <FloatingAgentDebugPanel align="left" /> : null}
      </div>
      <div
        className={cn(
          'pointer-events-auto flex items-start gap-2',
          voiceModeActive && 'opacity-50',
        )}
      >
        <button
          type="button"
          aria-label="Open trajectory compass"
          aria-controls={sheetPanelId}
          aria-expanded={trajectoryOpen}
          disabled={voiceModeActive}
          onClick={onOpenTrajectory}
          className={cn(floatingActionClassName, disabledClasses)}
          data-testid="floating-action-compass"
          title="Trajectory compass"
        >
          <Compass aria-hidden className="h-4 w-4" />
          <span className="sr-only">Trajectory compass</span>
        </button>
        <ProfileMenu
          authMenu={authMenu}
          disabledClasses={disabledClasses}
          onOpenProfile={onOpenProfile}
          profileOpen={profileOpen}
          sheetPanelId={sheetPanelId}
          voiceModeActive={voiceModeActive}
        />
      </div>
    </nav>
  )
}

function ProfileMenu({
  authMenu,
  disabledClasses,
  onOpenProfile,
  profileOpen,
  sheetPanelId,
  voiceModeActive,
}: {
  authMenu: FloatingAuthMenuState
  disabledClasses: string | null
  onOpenProfile?: () => void
  profileOpen: boolean
  sheetPanelId?: string
  voiceModeActive: boolean
}) {
  return (
    <button
      type="button"
      disabled={voiceModeActive}
      onClick={onOpenProfile}
      aria-expanded={profileOpen}
      aria-controls={sheetPanelId}
      className={cn(floatingActionClassName, disabledClasses)}
      data-testid="floating-action-profile"
      title={authMenu.status === 'signed-in' ? authMenu.label : 'Profile'}
    >
      <UserRound aria-hidden className="h-4 w-4" />
      <span className="sr-only">Open profile</span>
    </button>
  )
}

const floatingActionClassName =
  'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.12)] backdrop-blur transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
