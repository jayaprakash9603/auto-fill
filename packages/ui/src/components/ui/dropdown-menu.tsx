import { DropdownMenu as MenuPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'
import { usePortalContainer } from '../../lib/portal'

export const DropdownMenu = MenuPrimitive.Root
export const DropdownMenuTrigger = MenuPrimitive.Trigger

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = 'end',
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  const container = usePortalContainer()
  return (
    <MenuPrimitive.Portal container={container}>
      <MenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'ufa:z-[2147483002] ufa:min-w-40 ufa:overflow-hidden ufa:rounded-md ufa:border ufa:border-border ufa:bg-popover ufa:p-1 ufa:text-popover-foreground ufa:shadow-lg',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'ufa:flex ufa:cursor-default ufa:items-center ufa:gap-2 ufa:rounded-sm ufa:px-2 ufa:py-1.5 ufa:text-sm ufa:outline-none ufa:select-none ufa:focus:bg-accent ufa:focus:text-accent-foreground ufa:data-[disabled]:pointer-events-none ufa:data-[disabled]:opacity-50 ufa:[&_svg]:size-4',
        destructive && 'ufa:text-destructive ufa:focus:text-destructive',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      className={cn('ufa:my-1 ufa:h-px ufa:bg-border', className)}
      {...props}
    />
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn(
        'ufa:px-2 ufa:py-1 ufa:text-xs ufa:font-medium ufa:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
