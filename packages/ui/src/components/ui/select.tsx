import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import { Fragment, type ComponentProps, type ReactNode } from 'react'

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
        'ufa:flex ufa:h-9 ufa:w-full ufa:min-w-0 ufa:items-center ufa:justify-between ufa:gap-2 ufa:rounded-md ufa:border ufa:border-input ufa:bg-background ufa:px-2.5 ufa:text-left ufa:text-sm ufa:whitespace-nowrap ufa:transition-colors ufa:outline-none ufa:focus-visible:border-ring ufa:focus-visible:outline-2 ufa:focus-visible:outline-ring/40 ufa:disabled:cursor-not-allowed ufa:disabled:opacity-50 ufa:aria-invalid:border-destructive ufa:data-[placeholder]:text-muted-foreground ufa:[&>span]:min-w-0 ufa:[&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="ufa:size-4 ufa:shrink-0 ufa:opacity-60" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectScrollUpButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        'ufa:flex ufa:cursor-default ufa:items-center ufa:justify-center ufa:py-1',
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="ufa:size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

export function SelectScrollDownButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        'ufa:flex ufa:cursor-default ufa:items-center ufa:justify-center ufa:py-1',
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="ufa:size-4" />
    </SelectPrimitive.ScrollDownButton>
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
          'ufa:relative ufa:z-[2147483002] ufa:max-h-[min(18rem,var(--radix-select-content-available-height))] ufa:min-w-[8rem] ufa:overflow-hidden ufa:rounded-md ufa:border ufa:border-border ufa:bg-popover ufa:text-popover-foreground ufa:shadow-lg',
          position === 'popper' &&
            'ufa:w-full ufa:min-w-[var(--radix-select-trigger-width)] ufa:data-[side=bottom]:translate-y-1 ufa:data-[side=top]:-translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className="ufa:p-1">{children}</SelectPrimitive.Viewport>
        <SelectScrollDownButton />
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
      data-slot="select-label"
      className={cn('ufa:px-2 ufa:py-1 ufa:text-xs ufa:text-muted-foreground', className)}
      {...props}
    />
  )
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('ufa:-mx-1 ufa:my-1 ufa:h-px ufa:bg-border', className)}
      {...props}
    />
  )
}

export interface SimpleSelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

export interface SimpleSelectGroup {
  label: ReactNode
  options: readonly SimpleSelectOption[]
}

export interface SimpleSelectProps extends Omit<
  ComponentProps<typeof SelectPrimitive.Trigger>,
  'value' | 'defaultValue' | 'onChange' | 'children' | 'dir'
> {
  value: string
  onValueChange: (value: string) => void
  /** Ungrouped options, listed before any groups. An option may use `''` as its value. */
  options?: readonly SimpleSelectOption[]
  groups?: readonly SimpleSelectGroup[]
  /** Shown while `value` matches no option. */
  placeholder?: ReactNode
  contentClassName?: string
}

// Radix reserves `''` for "no selection", so an option that means "none" or "all" needs a stand-in.
const EMPTY_OPTION = '__ufa-empty__'
const toItemValue = (value: string) => (value === '' ? EMPTY_OPTION : value)
const fromItemValue = (value: string) => (value === EMPTY_OPTION ? '' : value)

/** A labelled shadcn select built from a flat option list, for the common single-choice case. */
export function SimpleSelect({
  value,
  onValueChange,
  options = [],
  groups = [],
  placeholder,
  disabled,
  contentClassName,
  ...triggerProps
}: SimpleSelectProps) {
  const visibleGroups = groups.filter((group) => group.options.length > 0)
  const hasEmptyOption = [...options, ...visibleGroups.flatMap((group) => group.options)].some(
    (option) => option.value === '',
  )
  const renderOption = (option: SimpleSelectOption) => (
    <SelectItem
      key={toItemValue(option.value)}
      value={toItemValue(option.value)}
      disabled={option.disabled}
    >
      {option.label}
    </SelectItem>
  )

  return (
    <Select
      value={value === '' && !hasEmptyOption ? '' : toItemValue(value)}
      onValueChange={(next) => onValueChange(fromItemValue(next))}
      disabled={disabled}
    >
      <SelectTrigger {...triggerProps}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map(renderOption)}
        {visibleGroups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 || options.length ? <SelectSeparator /> : null}
            <SelectGroup>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map(renderOption)}
            </SelectGroup>
          </Fragment>
        ))}
      </SelectContent>
    </Select>
  )
}
