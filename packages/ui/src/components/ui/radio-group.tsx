import { CircleIcon } from 'lucide-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export function RadioGroup({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('ufa:grid ufa:gap-2', className)}
      {...props}
    />
  )
}

export function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'ufa:peer ufa:inline-flex ufa:aspect-square ufa:size-4 ufa:shrink-0 ufa:items-center ufa:justify-center ufa:rounded-full ufa:border ufa:border-input ufa:bg-background ufa:text-primary ufa:dark:bg-input/30 ufa:transition-colors ufa:outline-none ufa:focus-visible:border-ring ufa:focus-visible:outline-2 ufa:focus-visible:outline-ring/40 ufa:disabled:cursor-not-allowed ufa:disabled:opacity-50 ufa:data-[state=checked]:border-primary',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="ufa:flex ufa:items-center ufa:justify-center"
      >
        <CircleIcon className="ufa:size-2 ufa:fill-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}
