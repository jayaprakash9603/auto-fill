import { CheckIcon } from 'lucide-react'
import {
  Checkbox as CheckboxPrimitive,
  Label as LabelPrimitive,
  Switch as SwitchPrimitive,
} from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

const fieldBase =
  'ufa:w-full ufa:min-w-0 ufa:rounded-md ufa:border ufa:border-input ufa:bg-background ufa:px-2.5 ufa:text-sm ufa:transition-colors ufa:outline-none ufa:focus-visible:border-ring ufa:focus-visible:outline-2 ufa:focus-visible:outline-ring/40 ufa:disabled:cursor-not-allowed ufa:disabled:opacity-50 ufa:aria-invalid:border-destructive'

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        fieldBase,
        'ufa:h-9 ufa:file:mr-2 ufa:file:inline-flex ufa:file:h-6 ufa:file:cursor-pointer ufa:file:items-center ufa:file:rounded-sm ufa:file:border-0 ufa:file:bg-secondary ufa:file:px-2 ufa:file:text-xs ufa:file:font-medium ufa:file:text-secondary-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldBase, 'ufa:min-h-16 ufa:py-2', className)}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'ufa:flex ufa:items-center ufa:gap-1.5 ufa:text-xs ufa:font-medium ufa:select-none ufa:peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'ufa:peer ufa:inline-flex ufa:size-4 ufa:shrink-0 ufa:items-center ufa:justify-center ufa:rounded-[4px] ufa:border ufa:border-input ufa:bg-background ufa:transition-colors ufa:data-[state=checked]:border-primary ufa:data-[state=checked]:bg-primary ufa:data-[state=checked]:text-primary-foreground ufa:disabled:cursor-not-allowed ufa:disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="ufa:flex ufa:items-center ufa:justify-center">
        <CheckIcon className="ufa:size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'ufa:peer ufa:inline-flex ufa:h-5 ufa:w-9 ufa:shrink-0 ufa:items-center ufa:rounded-full ufa:border ufa:border-transparent ufa:transition-colors ufa:data-[state=checked]:bg-primary ufa:data-[state=unchecked]:bg-input ufa:disabled:cursor-not-allowed ufa:disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="ufa:pointer-events-none ufa:block ufa:size-4 ufa:rounded-full ufa:bg-background ufa:shadow ufa:transition-transform ufa:data-[state=checked]:translate-x-4 ufa:data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  )
}
