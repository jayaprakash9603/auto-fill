import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export const buttonVariants = cva(
  'ufa:inline-flex ufa:items-center ufa:justify-center ufa:gap-1.5 ufa:whitespace-nowrap ufa:rounded-md ufa:text-sm ufa:font-medium ufa:transition-colors ufa:disabled:pointer-events-none ufa:disabled:opacity-50 ufa:[&_svg]:size-4 ufa:[&_svg]:shrink-0 ufa:focus-visible:outline-2 ufa:focus-visible:outline-offset-2 ufa:focus-visible:outline-ring',
  {
    variants: {
      variant: {
        default: 'ufa:bg-primary ufa:text-primary-foreground ufa:hover:bg-primary/90',
        destructive:
          'ufa:bg-destructive ufa:text-destructive-foreground ufa:hover:bg-destructive/90',
        outline:
          'ufa:border ufa:border-border ufa:bg-background ufa:hover:bg-accent ufa:hover:text-accent-foreground',
        secondary: 'ufa:bg-secondary ufa:text-secondary-foreground ufa:hover:bg-secondary/80',
        ghost: 'ufa:hover:bg-accent ufa:hover:text-accent-foreground',
        link: 'ufa:text-primary ufa:underline-offset-4 ufa:hover:underline',
      },
      size: {
        default: 'ufa:h-9 ufa:px-3',
        sm: 'ufa:h-8 ufa:px-2.5 ufa:text-xs',
        lg: 'ufa:h-10 ufa:px-5',
        icon: 'ufa:size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button'
  return (
    <Component
      data-slot="button"
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
