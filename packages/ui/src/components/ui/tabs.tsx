import { Tabs as TabsPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('ufa:flex ufa:flex-col ufa:gap-3', className)}
      {...props}
    />
  )
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'ufa:flex ufa:h-9 ufa:w-full ufa:items-stretch ufa:border-b ufa:border-border ufa:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** Underlined tab, as in the host toolbox. `count` is decorative; the tab name stays the label. */
export function TabsTrigger({
  className,
  count,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger> & { count?: number }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'ufa:group ufa:relative ufa:inline-flex ufa:flex-1 ufa:cursor-pointer ufa:items-center ufa:justify-center ufa:gap-1.5 ufa:px-3 ufa:text-sm ufa:font-medium ufa:whitespace-nowrap ufa:outline-none ufa:transition-colors ufa:duration-150 ufa:hover:text-foreground ufa:focus-visible:rounded-md ufa:focus-visible:outline-2 ufa:focus-visible:-outline-offset-2 ufa:focus-visible:outline-ring ufa:disabled:pointer-events-none ufa:disabled:opacity-50 ufa:data-[state=active]:text-foreground ufa:[&_svg]:size-3.5 ufa:[&_svg]:shrink-0',
        'ufa:after:pointer-events-none ufa:after:absolute ufa:after:inset-x-2 ufa:after:bottom-0 ufa:after:h-0.5 ufa:after:scale-x-0 ufa:after:rounded-full ufa:after:bg-primary ufa:after:transition-transform ufa:after:duration-200 ufa:after:ease-out ufa:data-[state=active]:after:scale-x-100 ufa:motion-reduce:after:transition-none',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span
          aria-hidden
          className="ufa:rounded-full ufa:bg-muted-foreground/15 ufa:px-1.5 ufa:text-[11px] ufa:leading-4 ufa:tabular-nums ufa:group-data-[state=active]:bg-primary/15 ufa:group-data-[state=active]:text-primary"
        >
          {count}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
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
