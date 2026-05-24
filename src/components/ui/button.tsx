import { Button as BaseButton } from '@base-ui-components/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from 'react'
import { cn } from '~/lib/utils'

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-[transform,background-color,color,box-shadow] duration-(--duration-fast) ease-(--ease-out) active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-foreground text-background hover:bg-foreground/90',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
        outline: 'border border-border bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
        destructive: 'bg-warning text-background hover:bg-warning/90',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        // `sm` is intentionally compact (32px) — below the 40×40 hit-area
        // minimum. Use only when the consumer extends the hit area via a
        // wrapper or `before:absolute before:-inset-X` pseudo-element.
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

// Compose Base UI's button props with our CVA variants. `BaseButton`'s
// props are a union (the `render` polymorphism), so we use a type alias
// instead of `interface extends` (which requires statically-known
// members).
export type ButtonProps = ComponentPropsWithoutRef<typeof BaseButton> &
  VariantProps<typeof buttonVariants> & { children?: ReactNode }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const { className, variant, size, ...rest } = props
  return (
    <BaseButton ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...rest} />
  )
})
Button.displayName = 'Button'
