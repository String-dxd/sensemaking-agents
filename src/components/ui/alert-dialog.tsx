import { AlertDialog as BaseAlertDialog } from '@base-ui-components/react/alert-dialog'
import type { ComponentProps, HTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

export const AlertDialog = BaseAlertDialog.Root
export const AlertDialogTrigger = BaseAlertDialog.Trigger
export const AlertDialogClose = BaseAlertDialog.Close
export const AlertDialogPortal = BaseAlertDialog.Portal

export function AlertDialogOverlay({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Backdrop>) {
  return (
    <BaseAlertDialog.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-200 ease-out',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

export function AlertDialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Popup>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <BaseAlertDialog.Popup
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4',
          'rounded-lg border border-border bg-background p-5 shadow-lg',
          'transition-[opacity,transform] duration-(--duration-base) ease-(--ease-out) motion-reduce:transition-none',
          'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
          'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          className,
        )}
        {...props}
      >
        {children}
      </BaseAlertDialog.Popup>
    </AlertDialogPortal>
  )
}

export function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />
}

export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Title>) {
  return (
    <BaseAlertDialog.Title
      className={cn('text-base font-semibold leading-tight', className)}
      {...props}
    />
  )
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Description>) {
  return (
    <BaseAlertDialog.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}
