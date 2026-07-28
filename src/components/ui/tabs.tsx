import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex w-full flex-col', className)}
      {...props}
    />
  )
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'relative flex w-max min-w-full items-center gap-1 border-b border-border',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'relative flex min-h-11 shrink-0 items-center justify-center rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-[background-color,color] duration-(--duration-fast) ease-(--ease-out) hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset data-active:text-foreground motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

export function TabsIndicator({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Indicator>) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        'absolute bottom-0 left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) bg-foreground transition-[translate,width] duration-(--duration-base) ease-(--ease-in-out) motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Panel>) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        'outline-none focus-visible:ring-2 focus-visible:ring-accent [[hidden]]:hidden',
        className,
      )}
      {...props}
    />
  )
}
