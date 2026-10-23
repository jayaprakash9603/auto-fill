import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export const badgeVariants = cva(
  'ufa:inline-flex ufa:items-center ufa:gap-1 ufa:rounded-full ufa:border ufa:px-2 ufa:py-0.5 ufa:text-[11px] ufa:font-medium ufa:leading-4 ufa:whitespace-nowrap ufa:[&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'ufa:border-transparent ufa:bg-primary ufa:text-primary-foreground',
        secondary: 'ufa:border-transparent ufa:bg-secondary ufa:text-secondary-foreground',
        outline: 'ufa:border-border ufa:text-foreground',
        success: 'ufa:border-transparent ufa:bg-success/15 ufa:text-success',
        warning: 'ufa:border-transparent ufa:bg-warning/15 ufa:text-warning',
        destructive: 'ufa:border-transparent ufa:bg-destructive/15 ufa:text-destructive',
        info: 'ufa:border-transparent ufa:bg-info/15 ufa:text-info',
        muted: 'ufa:border-transparent ufa:bg-muted ufa:text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}
