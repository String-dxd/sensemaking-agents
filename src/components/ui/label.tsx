import { forwardRef, type LabelHTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, children, htmlFor, ...props }, ref) => (
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={cn('text-sm font-medium leading-none text-foreground', className)}
      {...props}
    >
      {children}
    </label>
  ),
)
Label.displayName = 'Label'
