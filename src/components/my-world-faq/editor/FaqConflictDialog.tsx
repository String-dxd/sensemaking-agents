import { Copy, X } from 'lucide-react'
import { useState } from 'react'
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import type { MyWorldFaqEditorialFieldComparison } from '~/data/my-world-faq'
import { cn } from '~/lib/utils'

const STATUS_LABELS = {
  'local-only': 'Only in my draft',
  'remote-only': 'Only in live',
  converged: 'Same change',
  overlap: 'Both changed differently',
} as const

type ChangedComparison = MyWorldFaqEditorialFieldComparison & {
  status: keyof typeof STATUS_LABELS
}

export function FaqConflictDialog({
  open,
  kind,
  comparisons,
  committedVersion,
  liveVersion,
  onKeepDraft,
  onStartFromLive,
}: {
  open: boolean
  kind: 'stale' | 'superseded'
  comparisons: readonly MyWorldFaqEditorialFieldComparison[]
  committedVersion?: number
  liveVersion: number
  onKeepDraft(): void
  onStartFromLive(): void
}) {
  const [confirmingLive, setConfirmingLive] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const changed = comparisons.filter(
    (comparison): comparison is ChangedComparison => comparison.status !== 'unchanged',
  )
  const counts = changed.reduce<Record<keyof typeof STATUS_LABELS, number>>(
    (current, comparison) => {
      current[comparison.status] += 1
      return current
    },
    { 'local-only': 0, 'remote-only': 0, converged: 0, overlap: 0 },
  )

  async function copyValue(path: string, owner: 'my' | 'live', value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus(`Copied ${owner === 'my' ? 'my draft' : 'live'} value for ${path}.`)
    } catch {
      setCopyStatus('Copy is unavailable in this browser.')
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onKeepDraft()
        }}
      >
        <DialogContent
          showClose={false}
          className="max-h-[min(92svh,58rem)] max-w-5xl overflow-y-auto rounded-[2rem_0.75rem_2rem_0.75rem] border-(--color-faq-line-strong) bg-(--color-faq-surface) p-5 text-(--color-faq-ink) sm:p-8"
        >
          <DialogClose
            aria-label="Keep draft and close comparison"
            className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full text-(--color-faq-ink-soft) outline-none hover:bg-(--color-faq-paper) focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogClose>
          <DialogHeader className="pr-12">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--color-faq-stage-ink)">
              Publish comparison
            </p>
            <DialogTitle className="text-2xl tracking-[-0.035em]">
              {kind === 'superseded'
                ? `Version ${committedVersion} published, but version ${liveVersion} is now live`
                : `Version ${liveVersion} changed while you were editing`}
            </DialogTitle>
            <DialogDescription className="max-w-[70ch] leading-relaxed text-(--color-faq-ink-soft)">
              Review every changed field. Copy values for reference if useful. This dialog never
              merges wording into your draft.
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <div
                key={status}
                className="rounded-xl border border-(--color-faq-line) bg-(--color-faq-paper) p-3"
              >
                <dt className="text-xs text-(--color-faq-ink-soft)">{label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {counts[status as keyof typeof STATUS_LABELS]}
                </dd>
              </div>
            ))}
          </dl>

          <p className="sr-only" role="status">
            {copyStatus}
          </p>

          <ul className="space-y-3">
            {changed.map((comparison) => (
              <li
                key={comparison.path}
                className="rounded-xl border border-(--color-faq-line-strong) bg-(--color-faq-paper) p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="break-all text-xs font-semibold">{comparison.path}</code>
                  <Badge variant="outline">{STATUS_LABELS[comparison.status]}</Badge>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <ComparisonValue
                    label="My draft"
                    path={comparison.path}
                    value={comparison.localValue}
                    onCopy={() => void copyValue(comparison.path, 'my', comparison.localValue)}
                  />
                  <ComparisonValue
                    label="Live"
                    path={comparison.path}
                    value={comparison.latestValue}
                    onCopy={() => void copyValue(comparison.path, 'live', comparison.latestValue)}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-col-reverse gap-2 border-t border-(--color-faq-line) pt-4 sm:flex-row sm:justify-end">
            <DialogClose
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-11')}
            >
              Keep draft
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="min-h-11"
              onClick={() => setConfirmingLive(true)}
            >
              Start from live
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingLive} onOpenChange={setConfirmingLive}>
        <AlertDialogContent className="border-(--color-faq-line-strong) bg-(--color-faq-surface) text-(--color-faq-ink)">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your draft and start from live?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed text-(--color-faq-ink-soft)">
              Your current draft will be replaced with live version {liveVersion}. This cannot be
              undone in the editor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-11')}
            >
              Return to comparison
            </AlertDialogClose>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="min-h-11"
              onClick={() => {
                setConfirmingLive(false)
                onStartFromLive()
              }}
            >
              Discard draft and start from live
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ComparisonValue({
  label,
  path,
  value,
  onCopy,
}: {
  label: string
  path: string
  value: string
  onCopy(): void
}) {
  return (
    <section className="min-w-0 rounded-lg bg-(--color-faq-surface) p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">{label}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Copy ${label.toLowerCase()} for ${path}`}
          onClick={onCopy}
        >
          <Copy aria-hidden="true" className="mr-1 size-3.5" />
          Copy {label.toLowerCase()}
        </Button>
      </div>
      <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-(--color-faq-ink-soft)">
        {value}
      </p>
    </section>
  )
}
