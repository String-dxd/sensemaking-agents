import { Radio as BaseRadio } from '@base-ui-components/react/radio'
import { RadioGroup as BaseRadioGroup } from '@base-ui-components/react/radio-group'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

export function RadioGroup({ className, ...props }: ComponentProps<typeof BaseRadioGroup>) {
  return <BaseRadioGroup className={cn('grid gap-2', className)} {...props} />
}

/**
 * A single radio. Renders a `<span>` (per Base UI). For tile-style pickers
 * (e.g. ContextTypePicker), pass tile content as children and style the
 * root with `aria-checked` selectors or via the `data-checked` attribute
 * Base UI sets automatically.
 */
export function RadioGroupItem({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseRadio.Root>) {
  return (
    <BaseRadio.Root
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-background text-sm transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'data-[checked]:border-accent data-[checked]:ring-2 data-[checked]:ring-accent',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </BaseRadio.Root>
  )
}
