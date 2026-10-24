import { Loader2Icon } from 'lucide-react'
import { Separator as SeparatorPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { usePortalContainer } from '../../lib/portal'

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'ufa:shrink-0 ufa:bg-border',
        orientation === 'horizontal' ? 'ufa:h-px ufa:w-full' : 'ufa:h-full ufa:w-px',
        className,
      )}
      {...props}
    />
  )
}

export function Spinner({
  className,
  label = 'Loading',
  ...props
}: ComponentProps<'svg'> & { label?: string }) {
  return (
    <Loader2Icon
      role="status"
      aria-label={label}
      className={cn('ufa:size-4 ufa:animate-spin', className)}
      {...props}
    />
  )
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('ufa:rounded-md ufa:bg-muted ufa:motion-safe:animate-pulse', className)}
      {...props}
    />
  )
}

export function Progress({
  value,
  className,
  label,
  ...props
}: ComponentProps<'div'> & { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn(
        'ufa:h-1.5 ufa:w-full ufa:overflow-hidden ufa:rounded-full ufa:bg-muted',
        className,
      )}
      {...props}
    >
      <div
        className="ufa:h-full ufa:bg-primary ufa:transition-[width]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  const container = usePortalContainer()
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal container={container}>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={4}
          className="ufa:z-[2147483003] ufa:max-w-64 ufa:rounded-md ufa:bg-foreground ufa:px-2 ufa:py-1 ufa:text-xs ufa:text-background ufa:shadow"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

const ALERT_TONES = {
  info: 'ufa:border-info/30 ufa:bg-info/10',
  warning: 'ufa:border-warning/30 ufa:bg-warning/10',
  destructive: 'ufa:border-destructive/30 ufa:bg-destructive/10',
  success: 'ufa:border-success/30 ufa:bg-success/10',
  neutral: 'ufa:border-border ufa:bg-muted/50',
} as const

export function Alert({
  tone = 'neutral',
  icon,
  title,
  children,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  tone?: keyof typeof ALERT_TONES
  icon?: ReactNode
  title?: ReactNode
}) {
  return (
    <div
      role={tone === 'destructive' ? 'alert' : 'status'}
      data-slot="alert"
      data-tone={tone}
      className={cn(
        'ufa:flex ufa:gap-2.5 ufa:rounded-lg ufa:border ufa:p-3 ufa:text-sm',
        ALERT_TONES[tone],
        className,
      )}
      {...props}
    >
      {icon ? <span className="ufa:mt-0.5 ufa:[&_svg]:size-4">{icon}</span> : null}
      <div className="ufa:flex ufa:min-w-0 ufa:flex-1 ufa:flex-col ufa:gap-1">
        {title ? <p className="ufa:font-medium ufa:leading-tight">{title}</p> : null}
        {children ? <div className="ufa:text-xs ufa:text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  )
}
