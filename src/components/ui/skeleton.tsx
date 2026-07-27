import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/**
 * Cold-load placeholder block. Sheets show these while the first backend
 * snapshot is still in flight (`useEngineHydrated() === false`) and the slice
 * they render is empty — never for a genuinely empty account, which gets the
 * real empty-state copy instead.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-lg bg-(--color-sheet-divider)', className)}
      {...props}
    />
  )
}
