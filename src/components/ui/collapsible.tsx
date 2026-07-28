import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

export function Collapsible({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      className={cn('w-full', className)}
      {...props}
    />
  )
}

export function CollapsibleTrigger({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  )
}

export function CollapsibleContent({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Panel>) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--duration-base) ease-(--ease-out) data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden"
      {...props}
    >
      <div className={cn('pt-4', className)}>{children}</div>
    </CollapsiblePrimitive.Panel>
  )
}
