import { Tabs as TabsPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('ufa:flex ufa:flex-col ufa:gap-2', className)}
      {...props}
    />
  )
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'ufa:inline-flex ufa:h-8 ufa:w-full ufa:items-center ufa:gap-0.5 ufa:rounded-md ufa:bg-muted ufa:p-0.5 ufa:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'ufa:inline-flex ufa:h-full ufa:flex-1 ufa:items-center ufa:justify-center ufa:gap-1 ufa:rounded-sm ufa:px-2 ufa:text-xs ufa:font-medium ufa:whitespace-nowrap ufa:transition-colors ufa:hover:text-foreground ufa:data-[state=active]:bg-background ufa:data-[state=active]:text-foreground ufa:data-[state=active]:shadow-sm ufa:[&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('ufa:outline-none', className, 'ufa:data-[state=inactive]:hidden')}
      {...props}
    />
  )
}
