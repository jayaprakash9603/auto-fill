import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'
import { usePortalContainer } from '../../lib/portal'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'ufa:flex ufa:h-9 ufa:w-full ufa:items-center ufa:justify-between ufa:gap-2 ufa:rounded-md ufa:border ufa:border-input ufa:bg-background ufa:px-2.5 ufa:text-sm ufa:whitespace-nowrap ufa:outline-none ufa:focus-visible:border-ring ufa:disabled:cursor-not-allowed ufa:disabled:opacity-50 ufa:data-[placeholder]:text-muted-foreground ufa:[&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="ufa:size-4 ufa:opacity-60" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  const container = usePortalContainer()
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          'ufa:relative ufa:z-[2147483002] ufa:max-h-72 ufa:min-w-[8rem] ufa:overflow-hidden ufa:rounded-md ufa:border ufa:border-border ufa:bg-popover ufa:text-popover-foreground ufa:shadow-lg',
          position === 'popper' &&
            'ufa:w-full ufa:min-w-[var(--radix-select-trigger-width)] ufa:data-[side=bottom]:translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="ufa:p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'ufa:relative ufa:flex ufa:w-full ufa:cursor-default ufa:items-center ufa:rounded-sm ufa:py-1.5 ufa:pr-8 ufa:pl-2 ufa:text-sm ufa:outline-none ufa:select-none ufa:focus:bg-accent ufa:focus:text-accent-foreground ufa:data-[disabled]:pointer-events-none ufa:data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="ufa:absolute ufa:right-2 ufa:flex ufa:size-3.5 ufa:items-center ufa:justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="ufa:size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('ufa:px-2 ufa:py-1 ufa:text-xs ufa:text-muted-foreground', className)}
      {...props}
    />
  )
}
