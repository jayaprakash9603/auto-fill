import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'
import { usePortalContainer } from '../../lib/portal'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  closeLabel = 'Close',
  hideClose = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { closeLabel?: string; hideClose?: boolean }) {
  const container = usePortalContainer()
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="ufa:fixed ufa:inset-0 ufa:z-[2147483000] ufa:bg-black/50"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'ufa:fixed ufa:top-1/2 ufa:left-1/2 ufa:z-[2147483001] ufa:flex ufa:max-h-[calc(100vh-2rem)] ufa:w-[calc(100vw-2rem)] ufa:max-w-lg ufa:-translate-x-1/2 ufa:-translate-y-1/2 ufa:flex-col ufa:gap-3 ufa:overflow-y-auto ufa:rounded-lg ufa:border ufa:border-border ufa:bg-popover ufa:p-4 ufa:text-popover-foreground ufa:shadow-xl',
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            className="ufa:absolute ufa:top-3 ufa:right-3 ufa:rounded-sm ufa:p-0.5 ufa:text-muted-foreground ufa:hover:text-foreground"
            aria-label={closeLabel}
          >
            <XIcon className="ufa:size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('ufa:flex ufa:flex-col ufa:gap-1 ufa:pr-6', className)}
      {...props}
    />
  )
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('ufa:flex ufa:flex-wrap ufa:justify-end ufa:gap-2', className)}
      {...props}
    />
  )
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('ufa:text-base ufa:font-semibold', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('ufa:text-sm ufa:text-muted-foreground', className)}
      {...props}
    />
  )
}
