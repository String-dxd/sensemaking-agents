import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/utils'

export interface EditableFieldProps {
  /** Initial / displayed value when not editing. */
  value: string
  /** Optional label above the field. */
  label?: ReactNode
  /** When the user confirms an edit. The component does not commit on its own. */
  onConfirm: (next: string) => void | Promise<void>
  /** Disable controls while parent mutation is pending. */
  pending?: boolean
  /** Error message from a failed mutation (caller-controlled). */
  error?: string | null
  /** Min length for confirm to be enabled. Empty strings always rejected. */
  minLength?: number
  className?: string
}

/**
 * Display ↔ textarea toggle. Keeps draft state local; only fires `onConfirm`
 * when the user clicks Confirm. Cancel reverts to the last displayed value.
 *
 * Used by Mirror signals/caution, Connector still_unclear, Pathfinder
 * trajectory, and any other field the wiki view marks editable.
 */
export function EditableField({
  value,
  label,
  onConfirm,
  pending = false,
  error = null,
  minLength = 1,
  className,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const draftValid = draft.trim().length >= minLength

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label ? <div className="text-xs font-medium text-muted-foreground">{label}</div> : null}
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            aria-label={typeof label === 'string' ? label : 'edit field'}
            data-testid="editable-textarea"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="accent"
              disabled={pending || !draftValid}
              onClick={async () => {
                try {
                  await onConfirm(draft.trim())
                  setEditing(false)
                } catch {
                  // Caller surfaces the error via the `error` prop; stay in
                  // edit mode so the user can retry or cancel.
                }
              }}
              data-testid="confirm-button"
            >
              {pending ? 'Saving…' : 'Confirm'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDraft(value)
                setEditing(false)
              }}
              data-testid="cancel-button"
            >
              Cancel
            </Button>
            {error ? (
              <span className="text-xs text-warning" role="alert">
                {error}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            data-testid="edit-button"
          >
            Edit
          </Button>
        </div>
      )}
    </div>
  )
}
