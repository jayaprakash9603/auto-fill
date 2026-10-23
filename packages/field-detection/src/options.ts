import { normalizeValue, type FieldOption } from '@ufa/core'

import { attr, clip, idRefs, isDisabled, isInput } from './dom'
import { resolveOptionLabel } from './labels'
import { cleanLabel, collapseWhitespace, textOf } from './text'

export const MAX_OPTIONS = 2_000
const MAX_OPTION_TEXT = 2_000

function toOption(value: string, label: string, selected: boolean, disabled: boolean): FieldOption {
  const text = clip(label, MAX_OPTION_TEXT)
  return {
    value: clip(value, MAX_OPTION_TEXT),
    label: text,
    normalizedLabel: clip(normalizeValue(text), MAX_OPTION_TEXT),
    selected,
    disabled,
  }
}

export function selectOptions(select: HTMLSelectElement): FieldOption[] {
  return Array.from(select.options)
    .slice(0, MAX_OPTIONS)
    .map((option) => {
      const group = option.parentElement?.localName === 'optgroup' ? option.parentElement : null
      return toOption(
        option.value,
        collapseWhitespace(option.label || option.text),
        option.selected,
        option.disabled || !!group?.hasAttribute('disabled'),
      )
    })
}

/** Options of a radio or checkbox group, native or ARIA. */
export function memberOptions(members: readonly Element[]): FieldOption[] {
  return members.slice(0, MAX_OPTIONS).map((member) => {
    const label = resolveOptionLabel(member)
    if (isInput(member)) {
      return toOption(member.value, label, member.checked, isDisabled(member))
    }
    return toOption(
      attr(member, 'data-value') ?? label,
      label,
      member.getAttribute('aria-checked') === 'true',
      member.getAttribute('aria-disabled') === 'true',
    )
  })
}

/** `role="option"` entries of an ARIA listbox, including ones in a closed popup. */
export function listboxOptions(listbox: Element): FieldOption[] {
  return Array.from(listbox.querySelectorAll('[role="option"]'))
    .slice(0, MAX_OPTIONS)
    .map((option) => {
      const label =
        attr(option, 'aria-label') ?? cleanLabel(textOf(option, { includeHidden: true })).text
      return toOption(
        attr(option, 'data-value') ?? label,
        label,
        option.getAttribute('aria-selected') === 'true' ||
          option.getAttribute('aria-checked') === 'true',
        option.getAttribute('aria-disabled') === 'true',
      )
    })
}

/** The listbox a combobox controls, when it is currently in the DOM. */
export function comboboxListbox(combobox: Element): Element | null {
  const referenced = [...idRefs(combobox, 'aria-controls'), ...idRefs(combobox, 'aria-owns')]
  return (
    referenced.find((entry) => entry.getAttribute('role') === 'listbox') ??
    referenced.map((entry) => entry.querySelector('[role="listbox"]')).find(Boolean) ??
    combobox.querySelector('[role="listbox"]')
  )
}

/** Options a combobox currently exposes: its listbox, or a native `<datalist>`. */
export function comboboxOptions(combobox: Element): FieldOption[] {
  const listbox = comboboxListbox(combobox)
  if (listbox) return listboxOptions(listbox)
  if (isInput(combobox) && combobox.list) {
    return Array.from(combobox.list.querySelectorAll('option'))
      .slice(0, MAX_OPTIONS)
      .map((option) => toOption(option.value, option.label || option.value, false, option.disabled))
  }
  return []
}
