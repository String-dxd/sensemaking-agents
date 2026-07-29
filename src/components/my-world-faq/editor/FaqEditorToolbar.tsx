import { ExternalLink, History, LogOut, Save, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Badge } from '~/components/ui/badge'
import { Button, buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

type PendingAction = 'exit' | 'logout' | null
export interface FaqEditorNavigationBlock {
  proceed(): void
  reset(): void
}

export function FaqEditorToolbar({
  displayName,
  baseVersion,
  dirtyCount,
  invalidCount,
  recordsControl,
  mutationLocked = false,
  saving = false,
  published = false,
  saveBlocked = false,
  publishNotice,
  degradedWarning,
  conflictControl,
  onHistory,
  onSave,
  onExit,
  onLogout,
  onDiscardConfirmed,
  navigationBlock,
}: {
  displayName: string
  baseVersion: number
  dirtyCount: number
  invalidCount: number
  recordsControl: ReactNode
  mutationLocked?: boolean
  saving?: boolean
  published?: boolean
  saveBlocked?: boolean
  publishNotice?: { tone: 'success' | 'error' | 'info'; message: string } | null
  degradedWarning?: string | null
  conflictControl?: ReactNode
  onHistory(): void
  onSave?: () => void | Promise<void>
  onExit(): void
  onLogout(): void | Promise<void>
  onDiscardConfirmed(): void
  navigationBlock?: FaqEditorNavigationBlock
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const isDirty = dirtyCount > 0
  const saveUnavailable = !onSave
  const saveDisabled =
    !isDirty || invalidCount > 0 || mutationLocked || saving || saveUnavailable || saveBlocked

  function requestAction(action: Exclude<PendingAction, null>) {
    if (mutationLocked) return
    if (isDirty) {
      setPendingAction(action)
      return
    }
    void runAction(action)
  }

  async function runAction(action: Exclude<PendingAction, null>) {
    if (mutationLocked) return
    setPendingAction(null)
    onDiscardConfirmed()
    if (action === 'logout') {
      await onLogout()
      return
    }
    onExit()
  }

  function keepEditing() {
    if (mutationLocked) return
    setPendingAction(null)
    navigationBlock?.reset()
  }

  function discardAndLeave() {
    if (mutationLocked) return
    if (navigationBlock) {
      onDiscardConfirmed()
      navigationBlock.proceed()
      return
    }
    if (pendingAction) void runAction(pendingAction)
  }

  return (
    <>
      <div className="sticky top-0 z-50 border-b border-(--color-faq-line-strong) bg-(--color-faq-surface) text-(--color-faq-ink) shadow-sm">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 px-3 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge className="bg-(--color-faq-ink) text-(--color-faq-paper)">Editing</Badge>
            <span className="truncate text-sm font-semibold">{displayName}</span>
            <span className="text-xs text-(--color-faq-ink-faint)">Version {baseVersion}</span>
            <Badge
              variant="outline"
              className="border-(--color-faq-line-strong) bg-(--color-faq-paper)"
            >
              {dirtyCount} {dirtyCount === 1 ? 'change' : 'changes'}
            </Badge>
            {invalidCount > 0 ? (
              <Badge
                variant="outline"
                className="border-(--color-faq-coral-ink) bg-(--color-faq-stage-soft) text-(--color-faq-coral-ink)"
              >
                {invalidCount} {invalidCount === 1 ? 'issue' : 'issues'}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {recordsControl}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 border-(--color-faq-line-strong) bg-(--color-faq-surface)"
              onClick={onHistory}
              disabled={mutationLocked}
            >
              <History aria-hidden="true" className="mr-2 size-4" />
              History
            </Button>
            <a
              href="/my-world/faq"
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'min-h-11 border-(--color-faq-line-strong) bg-(--color-faq-surface)',
              )}
            >
              View live FAQ
              <ExternalLink aria-hidden="true" className="ml-2 size-4" />
            </a>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="min-h-11"
              onClick={() => requestAction('logout')}
              disabled={mutationLocked}
            >
              <LogOut aria-hidden="true" className="mr-2 size-4" />
              Log out
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="min-h-11"
              onClick={() => requestAction('exit')}
              disabled={mutationLocked}
            >
              <X aria-hidden="true" className="mr-2 size-4" />
              Exit
            </Button>
            <Button
              type="button"
              size="lg"
              className="min-h-11 bg-(--color-faq-ink) text-(--color-faq-paper)"
              disabled={saveDisabled}
              aria-describedby="faq-editor-publish-note"
              onClick={() => void onSave?.()}
            >
              <Save aria-hidden="true" className="mr-2 size-4" />
              {saving ? 'Publishing…' : published ? 'Published' : 'Save & publish'}
            </Button>
          </div>
        </div>
        <p
          id="faq-editor-publish-note"
          className="border-t border-(--color-faq-line) px-4 py-2 text-center text-xs leading-relaxed text-(--color-faq-ink-soft)"
        >
          {saveUnavailable
            ? 'Publishing is not connected in this build. Your edits stay in this page.'
            : 'Publishing updates the live FAQ immediately. There is no approval step.'}
        </p>
        {publishNotice ? (
          <div
            role={publishNotice.tone === 'error' ? 'alert' : 'status'}
            className={`border-t border-(--color-faq-line) px-4 py-2 text-center text-xs leading-relaxed ${
              publishNotice.tone === 'error'
                ? 'text-(--color-faq-coral-ink)'
                : 'text-(--color-faq-ink-soft)'
            }`}
          >
            {publishNotice.message} {conflictControl}
          </div>
        ) : null}
        {degradedWarning ? (
          <p
            role="status"
            className="border-t border-(--color-faq-line) bg-(--color-faq-yellow) px-4 py-2 text-center text-xs leading-relaxed text-(--color-faq-ink)"
          >
            {degradedWarning}
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={!mutationLocked && (pendingAction !== null || navigationBlock !== undefined)}
        onOpenChange={(open) => {
          if (mutationLocked) return
          if (!open) keepEditing()
        }}
      >
        <AlertDialogContent className="border-(--color-faq-line-strong) bg-(--color-faq-surface) text-(--color-faq-ink)">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed text-(--color-faq-ink-soft)">
              Your unpublished edits exist only in this page. Leaving will remove them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              disabled={mutationLocked}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-11')}
            >
              Keep editing
            </AlertDialogClose>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="min-h-11"
              disabled={mutationLocked}
              onClick={discardAndLeave}
            >
              Discard and leave
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
