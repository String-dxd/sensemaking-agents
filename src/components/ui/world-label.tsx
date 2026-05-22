import type { HTMLAttributes, Ref } from 'react'
import { cn } from '~/lib/utils'

/**
 * In-world DOM label primitive — positioned by Three.js mesh projection.
 *
 * The position is owned by `useWorldPosition()` which mutates `transform`,
 * `opacity`, and `pointer-events` directly on this element. We deliberately
 * do NOT take a `position` prop — passing position via React state would
 * cause one re-render per frame for every label, which would dominate the
 * frame budget. The ref-callback API keeps React out of the hot path.
 *
 * Usage:
 *
 *   const ref = useWorldPosition(meshRef, engineProjector)
 *   return <WorldLabel ref={ref}>Mailbox</WorldLabel>
 */
export interface WorldLabelProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>
}

export function WorldLabel({ className, ref, style, ...props }: WorldLabelProps) {
  return (
    <div
      ref={ref}
      data-testid="world-label"
      className={cn(
        'fixed left-0 top-0 z-30 origin-top-left will-change-transform select-none',
        // Initial transform/opacity — useWorldPosition takes over on first frame.
        className,
      )}
      style={{ opacity: 0, pointerEvents: 'none', ...style }}
      {...props}
    />
  )
}
