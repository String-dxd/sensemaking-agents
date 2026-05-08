import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { EditableField } from '~/components/EditableField'

export interface ConfirmAndSaveProps<TInput, TResult> {
  value: string
  label?: ReactNode
  /** Build the mutation input from the new field text. */
  buildInput: (next: string) => TInput
  /** Calls the underlying server fn (or mock). */
  mutationFn: (input: TInput) => Promise<TResult>
  /** Query keys to invalidate on success. */
  invalidate?: ReadonlyArray<ReadonlyArray<unknown>>
  /** Optional optimistic preview override — by default the field shows `next` while pending. */
  pendingPreview?: (next: string) => string
  className?: string
  minLength?: number
}

/**
 * Wraps `EditableField` with a TanStack Query mutation. Used by Mirror
 * caution edits in U3 (mocked) and the real persistence path in U9.
 */
export function ConfirmAndSave<TInput, TResult>({
  value,
  label,
  buildInput,
  mutationFn,
  invalidate,
  pendingPreview,
  className,
  minLength,
}: ConfirmAndSaveProps<TInput, TResult>) {
  const qc = useQueryClient()
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (next: string) => mutationFn(buildInput(next)),
    onMutate: async (next) => {
      setError(null)
      setOptimistic(pendingPreview ? pendingPreview(next) : next)
    },
    onError: (e: unknown) => {
      setOptimistic(null)
      setError(e instanceof Error ? e.message : 'Failed to save.')
    },
    onSuccess: async () => {
      setOptimistic(null)
      if (invalidate) {
        await Promise.all(invalidate.map((key) => qc.invalidateQueries({ queryKey: [...key] })))
      }
    },
  })

  return (
    <EditableField
      value={optimistic ?? value}
      label={label}
      pending={mutation.isPending}
      error={error}
      minLength={minLength}
      onConfirm={async (next) => {
        await mutation.mutateAsync(next)
      }}
      className={className}
    />
  )
}
