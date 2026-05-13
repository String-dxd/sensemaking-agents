import { demoSignInHref, workosSignInHref } from '~/auth/demo'
import type { FloatingAuthMenuState } from '~/components/FloatingWorldActions'
import { SheetEntryRail, type SheetKey } from '~/components/SheetEntryRail'
import type { VipsDimension } from '~/data/vips-taxonomy'

export interface ProfileSheetViewProps {
  authMenu?: FloatingAuthMenuState
  openSheet: SheetKey | null
  onOpenSheet: (key: VipsDimension) => void
  sheetPanelId: string
  disabled?: boolean
}

export function ProfileSheetView({
  authMenu = { status: 'signed-out' },
  openSheet,
  onOpenSheet,
  sheetPanelId,
  disabled = false,
}: ProfileSheetViewProps) {
  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2"
      data-testid="profile-sheet"
    >
      <header className="grid gap-4 border-b border-border/70 pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Profile
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            {authMenu.status === 'signed-in' ? authMenu.label : 'Your space'}
          </h2>
          {authMenu.status === 'signed-in' && authMenu.detail ? (
            <p className="mt-1 text-sm text-muted-foreground">{authMenu.detail}</p>
          ) : null}
        </div>
        <div className="text-sm">
          {authMenu.status === 'signed-in' ? (
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-full bg-muted px-3 py-1.5 text-left text-muted-foreground hover:text-foreground"
              >
                sign out
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <a
                className="rounded-full bg-foreground px-3 py-1.5 text-background hover:bg-foreground/90"
                href={workosSignInHref('/?sheet=profile')}
              >
                sign in
              </a>
              <form action={demoSignInHref('/?sheet=profile')} method="post">
                <button
                  type="submit"
                  className="rounded-full bg-muted px-3 py-1.5 text-left text-muted-foreground hover:text-foreground"
                >
                  use demo account
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Pages
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Profile dimensions compiled from confirmed reflections.
          </p>
        </div>
        <SheetEntryRail
          openSheet={openSheet}
          onOpenSheet={onOpenSheet}
          sheetPanelId={sheetPanelId}
          disabled={disabled}
        />
      </section>
    </section>
  )
}
