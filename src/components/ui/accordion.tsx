import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'
import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

export function Accordion({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Root>) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn('flex w-full flex-col gap-3', className)}
      {...props}
    />
  )
}

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-background shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="m-0">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold leading-snug outline-none transition-[background-color,color] duration-(--duration-fast) ease-(--ease-out) select-none hover:not-data-disabled:bg-muted focus-visible:relative focus-visible:z-1 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset motion-reduce:transition-none',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) ease-(--ease-out) group-data-panel-open:rotate-180 motion-reduce:transition-none"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Panel>) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="h-(--accordion-panel-height) overflow-hidden transition-[height] duration-(--duration-base) ease-(--ease-out) data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden"
      {...props}
    >
      <div className={cn('border-t border-border px-5 py-5', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  )
}
