import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1.5 border font-medium transition-colors', {
  variants: {
    variant: {
      default: 'border-transparent bg-foreground text-background',
      secondary: 'border-transparent bg-muted text-muted-foreground',
      accent: 'border-transparent bg-accent text-accent-foreground',
      'accent-soft': 'border-transparent bg-accent/15 text-accent',
      outline: 'border-border bg-background text-foreground',
      warning: 'border-transparent bg-warning text-background',
    },
    size: {
      default: 'px-2.5 py-0.5 text-xs',
      sm: 'px-1.5 py-0.5 text-[11px]',
    },
    radius: {
      pill: 'rounded-full',
      sm: 'rounded',
    },
  },
  defaultVariants: { variant: 'default', size: 'default', radius: 'pill' },
})

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, radius, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, radius }), className)} {...props} />
}

export { badgeVariants }
