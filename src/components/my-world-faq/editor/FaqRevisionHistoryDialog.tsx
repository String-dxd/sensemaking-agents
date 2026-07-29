import { ChevronDown, History, LoaderCircle, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Skeleton } from '~/components/ui/skeleton'
import { cn } from '~/lib/utils'
import {
  loadMyWorldFaqRevisionHistory,
  loadMyWorldFaqRevisionPreview,
  type MyWorldFaqEditorBaseSnapshot,
  type MyWorldFaqEditorSessionState,
  type MyWorldFaqRevisionMetadata,
  type MyWorldFaqRevisionPreviewData,
  type RestoreMyWorldFaqEditorRequest,
  type RestoreMyWorldFaqEditorResponse,
} from '~/server/my-world-faq-editor.functions'
import { fetchEditorJsonWithDeadline } from './editor-request'

type ReadyPreview = Extract<MyWorldFaqRevisionPreviewData, { status: 'ready' }>['revision']
type SuccessfulRestore = Extract<RestoreMyWorldFaqEditorResponse, { ok: true }>

export function FaqRevisionHistoryDialog({
  open,
  currentBase,
  isDirty,
  onOpenChange,
  onReloadCurrent,
  onRestored,
  onAccessLost,
  onMutationStateChanged,
}: {
  open: boolean
  currentBase: MyWorldFaqEditorBaseSnapshot
  isDirty: boolean
  onOpenChange(open: boolean): void
  onReloadCurrent(options: { discardDraft: boolean }): Promise<boolean>
  onRestored(result: SuccessfulRestore): void
  onAccessLost(state: Exclude<MyWorldFaqEditorSessionState, { status: 'ready' }>): void
  onMutationStateChanged(active: boolean): void
}) {
  const restoreAttemptRef = useRef<{ key: string; attemptId: string } | null>(null)
  const previewRequestRef = useRef(0)
  const historyVersionRef = useRef<number | null>(null)
  const [items, setItems] = useState<MyWorldFaqRevisionMetadata[]>([])
  const [nextBeforeVersion, setNextBeforeVersion] = useState<number | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ReadyPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [restoreConfirming, setRestoreConfirming] = useState(false)
  const [discardConfirming, setDiscardConfirming] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [restoreNeedsReload, setRestoreNeedsReload] = useState(false)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)
  const mutationLocked = restoring || reloading

  function requestOpenChange(nextOpen: boolean) {
    if (mutationLocked && !nextOpen) return
    onOpenChange(nextOpen)
  }

  const loseAccess = useCallback(
    (status: 'locked' | 'unavailable') => {
      previewRequestRef.current += 1
      historyVersionRef.current = null
      restoreAttemptRef.current = null
      setItems([])
      setNextBeforeVersion(null)
      setSelectedRevisionId(null)
      setPreview(null)
      setPreviewError(null)
      setRestoreMessage(null)
      setRestoreConfirming(false)
      setDiscardConfirming(false)
      onOpenChange(false)
      onAccessLost({ status })
    },
    [onAccessLost, onOpenChange],
  )

  const loadHistoryPage = useCallback(
    async (beforeVersion?: number) => {
      if (beforeVersion === undefined) historyVersionRef.current = currentBase.head.version
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        const result = await loadMyWorldFaqRevisionHistory({
          data: { ...(beforeVersion === undefined ? {} : { beforeVersion }), limit: 20 },
        })
        if (result.status === 'locked') {
          loseAccess('locked')
          return
        }
        if (result.status === 'unavailable') {
          setHistoryError('Revision history is unavailable right now.')
          return
        }
        setItems((current) => {
          const merged = beforeVersion === undefined ? result.items : [...current, ...result.items]
          return [...new Map(merged.map((item) => [item.revisionId, item])).values()]
        })
        setNextBeforeVersion(result.nextBeforeVersion)
      } catch {
        setHistoryError('Revision history is unavailable right now.')
      } finally {
        setHistoryLoading(false)
      }
    },
    [currentBase.head.version, loseAccess],
  )

  useEffect(() => {
    if (!open || historyLoading) return
    if (historyVersionRef.current === currentBase.head.version) return
    void loadHistoryPage()
  }, [currentBase.head.version, historyLoading, loadHistoryPage, open])

  async function selectRevision(revisionId: string) {
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setSelectedRevisionId(revisionId)
    setPreview(null)
    setPreviewError(null)
    setRestoreMessage(null)
    setPreviewLoading(true)
    restoreAttemptRef.current = null
    try {
      const result = await loadMyWorldFaqRevisionPreview({ data: { revisionId } })
      if (previewRequestRef.current !== requestId) return
      if (result.status === 'locked') {
        loseAccess('locked')
        return
      }
      if (result.status === 'unavailable') {
        setPreviewError('This version could not be loaded right now.')
        return
      }
      if (result.status === 'unsupported') {
        setPreviewError(
          'This version was saved in a newer format and cannot be previewed here yet.',
        )
        return
      }
      setPreview(result.revision)
    } catch {
      if (previewRequestRef.current !== requestId) return
      setPreviewError('This version could not be loaded right now.')
    } finally {
      if (previewRequestRef.current === requestId) setPreviewLoading(false)
    }
  }

  async function restoreSelectedRevision() {
    if (!preview || isDirty || restoring || restoreNeedsReload) return

    const expectedBase = { ...currentBase.head }
    const restoreKey = JSON.stringify({
      targetRevisionId: preview.head.revisionId,
      expectedBase,
    })
    if (restoreAttemptRef.current?.key !== restoreKey) {
      restoreAttemptRef.current = {
        key: restoreKey,
        attemptId: createRestoreAttemptId(),
      }
    }
    const requestBody: RestoreMyWorldFaqEditorRequest = {
      schemaVersion: 1,
      targetRevisionId: preview.head.revisionId,
      expectedBase,
      attemptId: restoreAttemptRef.current.attemptId,
    }

    setRestoring(true)
    onMutationStateChanged(true)
    setRestoreMessage(null)
    try {
      let response: Response
      let body: RestoreMyWorldFaqEditorResponse | null
      try {
        const result = await fetchEditorJsonWithDeadline<RestoreMyWorldFaqEditorResponse>(
          '/api/my-world/faq/editor/restore',
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
        )
        response = result.response
        body = result.body
      } catch {
        setRestoreMessage('The restore could not be confirmed. Try again.')
        return
      }

      if (response.status === 401) {
        loseAccess('locked')
        return
      }
      if (response.status === 409) {
        setRestoreConfirming(false)
        setRestoreNeedsReload(true)
        setRestoreMessage(
          body && !body.ok
            ? `${body.message} Reload the current version before trying again.`
            : 'A newer version is live. Reload it before trying again.',
        )
        return
      }
      if (!response.ok || !body?.ok) {
        setRestoreMessage(
          body && !body.ok
            ? body.message
            : 'The selected version could not be restored. Nothing changed.',
        )
        return
      }

      restoreAttemptRef.current = null
      setRestoreConfirming(false)
      onRestored(body)
      onOpenChange(false)
    } finally {
      setRestoring(false)
      onMutationStateChanged(false)
    }
  }

  async function reloadCurrent(discardDraft: boolean) {
    if (reloading) return
    setReloading(true)
    onMutationStateChanged(true)
    setRestoreMessage(null)
    try {
      const reloaded = await onReloadCurrent({ discardDraft })
      if (!reloaded) {
        setRestoreMessage(
          'The current live version could not be reloaded. Your draft is unchanged.',
        )
        return
      }
      restoreAttemptRef.current = null
      setRestoreNeedsReload(false)
      setDiscardConfirming(false)
      setRestoreMessage('Reloaded the current live version. You can now restore this preview.')
    } finally {
      setReloading(false)
      onMutationStateChanged(false)
    }
  }

  const selectedMetadata = items.find((item) => item.revisionId === selectedRevisionId)
  const restoringCurrent =
    preview?.head.revisionId === currentBase.head.revisionId ||
    preview?.head.digest === currentBase.head.digest

  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent
          className="grid max-h-[min(94svh,72rem)] w-[min(96vw,96rem)] max-w-none grid-rows-[auto_1fr] overflow-hidden rounded-[2rem_0.75rem_2rem_0.75rem] border-(--color-faq-line-strong) bg-(--color-faq-surface) p-0 text-(--color-faq-ink)"
          closeLabel="Close revision history"
        >
          <DialogHeader className="border-b border-(--color-faq-line-strong) px-5 py-5 pr-14 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--color-faq-stage-ink)">
              Published record
            </p>
            <DialogTitle className="text-2xl tracking-[-0.035em]">Revision history</DialogTitle>
            <DialogDescription className="max-w-[72ch] leading-relaxed text-(--color-faq-ink-soft)">
              Names are self-declared. Previewing a version does not change your draft or the live
              FAQ.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 lg:grid-cols-[21rem_minmax(0,1fr)]">
            <aside
              aria-label="Published versions"
              className="min-h-0 overflow-y-auto border-b border-(--color-faq-line-strong) bg-(--color-faq-paper) p-4 lg:border-r lg:border-b-0"
            >
              {historyError ? (
                <div role="alert" className="rounded-xl border border-(--color-faq-line) p-4">
                  <p className="text-sm text-(--color-faq-coral-ink)">{historyError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 min-h-11"
                    disabled={mutationLocked}
                    onClick={() => void loadHistoryPage()}
                  >
                    Try again
                  </Button>
                </div>
              ) : null}

              <ol className="space-y-2">
                {items.map((item) => {
                  const selected = item.revisionId === selectedRevisionId
                  const current = item.revisionId === currentBase.head.revisionId
                  return (
                    <li key={item.revisionId}>
                      <button
                        type="button"
                        aria-current={selected ? 'true' : undefined}
                        className={cn(
                          'w-full rounded-[1.25rem_0.45rem_1.25rem_0.45rem] border p-4 text-left outline-none transition-colors motion-reduce:transition-none',
                          'focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-2',
                          selected
                            ? 'border-(--color-faq-ink) bg-(--color-faq-yellow)'
                            : 'border-(--color-faq-line) bg-(--color-faq-surface) hover:border-(--color-faq-line-strong)',
                        )}
                        disabled={mutationLocked}
                        onClick={() => void selectRevision(item.revisionId)}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold">Version {item.version}</span>
                          {current ? (
                            <Badge className="bg-(--color-faq-ink) text-(--color-faq-paper)">
                              Live
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-2 block text-xs leading-relaxed text-(--color-faq-ink-soft)">
                          {revisionAttribution(item)}
                        </span>
                        <time
                          dateTime={item.createdAt}
                          className="mt-1 block text-xs text-(--color-faq-ink-faint)"
                        >
                          {formatSingaporeDate(item.createdAt)}
                        </time>
                        {item.restoredFromRevisionId ? (
                          <span className="mt-2 block text-xs font-semibold text-(--color-faq-stage-ink)">
                            Published from an earlier version
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ol>

              {historyLoading ? (
                <div role="status" aria-label="Loading revision history" className="mt-3 space-y-2">
                  <Skeleton className="h-24 rounded-xl" />
                  <Skeleton className="h-24 rounded-xl" />
                </div>
              ) : null}

              {nextBeforeVersion !== null && !historyLoading ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11 w-full border-(--color-faq-line-strong)"
                  disabled={mutationLocked}
                  onClick={() => void loadHistoryPage(nextBeforeVersion)}
                >
                  Load earlier versions
                  <ChevronDown aria-hidden="true" className="ml-2 size-4" />
                </Button>
              ) : null}
            </aside>

            <section
              aria-live="polite"
              aria-label="Historical FAQ preview"
              className="min-h-0 overflow-y-auto bg-(--color-faq-paper)"
            >
              {!selectedRevisionId && !previewLoading ? (
                <div className="grid min-h-full place-items-center p-8 text-center">
                  <div className="max-w-md">
                    <span
                      aria-hidden="true"
                      className="mx-auto grid size-16 place-items-center rounded-[1.5rem_0.5rem_1.5rem_0.5rem] bg-(--color-faq-blue)"
                    >
                      <History className="size-7" />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold">Choose a published version</h3>
                    <p className="mt-2 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                      You can inspect the whole page before deciding whether to restore it.
                    </p>
                  </div>
                </div>
              ) : null}

              {previewLoading ? (
                <div
                  role="status"
                  aria-label="Loading selected version"
                  className="grid min-h-full place-items-center p-8"
                >
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-8 animate-spin motion-reduce:animate-none"
                  />
                </div>
              ) : null}

              {previewError ? (
                <div className="grid min-h-full place-items-center p-8 text-center">
                  <div className="max-w-md">
                    <h3 className="text-xl font-semibold">Preview unavailable</h3>
                    <p role="alert" className="mt-2 text-sm text-(--color-faq-coral-ink)">
                      {previewError}
                    </p>
                    {selectedRevisionId ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 min-h-11"
                        onClick={() => void selectRevision(selectedRevisionId)}
                      >
                        Try again
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {preview ? (
                <>
                  <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-(--color-faq-line-strong) bg-(--color-faq-yellow) px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Historical preview: version {preview.head.version}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-(--color-faq-ink-soft)">
                        {selectedMetadata
                          ? revisionAttribution(selectedMetadata)
                          : 'Published FAQ snapshot'}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <Button
                        type="button"
                        className="min-h-11 bg-(--color-faq-ink) text-(--color-faq-paper)"
                        disabled={isDirty || restoringCurrent || restoring || restoreNeedsReload}
                        onClick={() => setRestoreConfirming(true)}
                      >
                        <RotateCcw aria-hidden="true" className="mr-2 size-4" />
                        {restoring ? 'Restoring…' : 'Restore this version'}
                      </Button>
                      {isDirty ? (
                        <p className="max-w-sm text-xs leading-relaxed text-(--color-faq-ink-soft)">
                          Restore is paused while you have an unpublished draft.
                        </p>
                      ) : restoringCurrent ? (
                        <p className="text-xs text-(--color-faq-ink-soft)">
                          This content is already live.
                        </p>
                      ) : restoreNeedsReload ? (
                        <p className="max-w-sm text-xs leading-relaxed text-(--color-faq-ink-soft)">
                          Reload the current live version before trying this restore again.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {isDirty ? (
                    <div className="flex flex-col gap-3 border-b border-(--color-faq-line-strong) bg-(--color-faq-surface) px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="max-w-2xl text-sm leading-relaxed text-(--color-faq-ink-soft)">
                        Keep editing to preserve your draft, or discard it and reload the current
                        live version before restoring.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11"
                          disabled={mutationLocked}
                          onClick={() => requestOpenChange(false)}
                        >
                          Keep editing
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 border-(--color-faq-line-strong)"
                          disabled={mutationLocked}
                          onClick={() => {
                            setRestoreMessage(null)
                            setDiscardConfirming(true)
                          }}
                        >
                          Discard draft and reload
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {restoreNeedsReload && !isDirty ? (
                    <div className="flex flex-col gap-3 border-b border-(--color-faq-line-strong) bg-(--color-faq-surface) px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="max-w-2xl text-sm leading-relaxed text-(--color-faq-ink-soft)">
                        The live FAQ changed after this preview was loaded. Reload the current live
                        version; this historical preview will stay selected.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 border-(--color-faq-line-strong)"
                        disabled={reloading}
                        onClick={() => void reloadCurrent(false)}
                      >
                        {reloading ? 'Reloading…' : 'Reload current version'}
                      </Button>
                    </div>
                  ) : null}

                  {restoreMessage && !restoreConfirming ? (
                    <p
                      role="alert"
                      className="border-b border-(--color-faq-line-strong) bg-(--color-faq-stage-soft) px-5 py-3 text-sm text-(--color-faq-coral-ink)"
                    >
                      {restoreMessage}
                    </p>
                  ) : null}

                  <div data-testid="faq-historical-preview">
                    <MyWorldFaqPage feedbackEnabled={false} content={preview.document} />
                  </div>
                </>
              ) : null}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={restoreConfirming}
        onOpenChange={(nextOpen) => {
          if (restoring && !nextOpen) return
          setRestoreConfirming(nextOpen)
        }}
      >
        <AlertDialogContent className="max-w-md border-(--color-faq-line-strong) bg-(--color-faq-surface) text-(--color-faq-ink)">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore version {preview?.head.version} as a new version?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed text-(--color-faq-ink-soft)">
              This publishes the complete version {preview?.head.version} snapshot over live version{' '}
              {currentBase.head.version}. Existing versions remain in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {restoreMessage ? (
            <p role="alert" className="text-sm leading-relaxed text-(--color-faq-coral-ink)">
              {restoreMessage}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose
              disabled={restoring}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-11')}
            >
              Keep current version
            </AlertDialogClose>
            <Button
              type="button"
              size="lg"
              className="min-h-11 bg-(--color-faq-ink) text-(--color-faq-paper)"
              disabled={restoring}
              onClick={() => void restoreSelectedRevision()}
            >
              {restoring ? 'Restoring…' : 'Restore and publish'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={discardConfirming}
        onOpenChange={(nextOpen) => {
          if (reloading && !nextOpen) return
          setDiscardConfirming(nextOpen)
        }}
      >
        <AlertDialogContent className="max-w-md border-(--color-faq-line-strong) bg-(--color-faq-surface) text-(--color-faq-ink)">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your draft and reload?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed text-(--color-faq-ink-soft)">
              Your unpublished wording will be removed. The editor will reload the current live
              version before you can restore an older one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {restoreMessage ? (
            <p role="alert" className="text-sm leading-relaxed text-(--color-faq-coral-ink)">
              {restoreMessage}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose
              disabled={reloading}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-11')}
            >
              Keep editing
            </AlertDialogClose>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="min-h-11"
              disabled={reloading}
              onClick={() => void reloadCurrent(true)}
            >
              {reloading ? 'Reloading…' : 'Discard and reload'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function revisionAttribution(revision: MyWorldFaqRevisionMetadata): string {
  if (revision.attributionKind === 'system-import') return 'Initial system import'
  return `Saved by ${revision.savedByName ?? 'unnamed collaborator'} (self-declared)`
}

function formatSingaporeDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  }).format(date)
}

function createRestoreAttemptId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}
