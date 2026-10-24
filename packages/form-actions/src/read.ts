import {
  fieldValuesEqual,
  normalizeValue,
  type ControlTarget,
  type FieldDescriptor,
  type FieldValue,
} from '@ufa/core'

import { collapse, isInput, isSelect, isTextArea } from './dom'
import { findListbox, listOptions } from './listbox'

/** Text a select-only combobox shows before anything is chosen. */
const PROMPT_TEXT = /^(select|choose|pick|please select)\b.{0,40}$|^[-–—\s]*$/i

export function isMemberChecked(member: Element): boolean {
  return isInput(member) ? member.checked : member.getAttribute('aria-checked') === 'true'
}

/**
 * The option value of the n-th member of a group, or of the n-th option of a select or listbox.
 * The field descriptor was produced from the same elements in the same order.
 */
export function optionValueAt(field: FieldDescriptor, index: number, element: Element): string {
  const known = field.options[index]?.value
  if (known !== undefined) return known
  if (isInput(element)) return element.value
  return element.getAttribute('data-value') ?? collapse(element.textContent)
}

function text(value: string): FieldValue {
  return { kind: 'text', text: value }
}

function comboboxText(target: ControlTarget): FieldValue {
  const { element, field } = target
  if (isInput(element)) return text(element.value)
  const listbox = findListbox(element)
  const chosen = listbox ? listOptions(listbox).find((option) => option.selected) : undefined
  if (chosen) return text(chosen.label)
  const shown = collapse(element.textContent)
  return text(shown === field.placeholder || PROMPT_TEXT.test(shown) ? '' : shown)
}

function selectedOptions(target: ControlTarget): FieldValue {
  const { element, field } = target
  if (isSelect(element)) {
    return {
      kind: 'options',
      values: Array.from(element.selectedOptions, (option) => option.value),
    }
  }
  const options = Array.from(element.querySelectorAll('[role="option"]'))
  return {
    kind: 'options',
    values: options.flatMap((option, index) =>
      option.getAttribute('aria-selected') === 'true' ||
      option.getAttribute('aria-checked') === 'true'
        ? [optionValueAt(field, index, option)]
        : [],
    ),
  }
}

/**
 * The live value of a control, read the way detection reads it. Never call this for prohibited
 * fields: their values are never read.
 */
export function readControlValue(target: ControlTarget): FieldValue | null {
  const { field, element, members } = target
  switch (field.type) {
    case 'file':
    case 'password':
      return null
    case 'checkbox':
      return { kind: 'checked', checked: isMemberChecked(element) }
    case 'radio-group':
    case 'checkbox-group':
      return {
        kind: 'options',
        values: members.flatMap((member, index) =>
          isMemberChecked(member) ? [optionValueAt(field, index, member)] : [],
        ),
      }
    case 'select':
    case 'multiselect':
      return selectedOptions(target)
    case 'combobox':
      return comboboxText(target)
    default:
      if (isInput(element) || isTextArea(element)) return text(element.value)
      return text(collapse(element.textContent))
  }
}

/**
 * Whether the control shows the expected value. Text compares with collapsed whitespace; phone
 * numbers by their digits, since pages often format them; combobox text by normalized label.
 */
export function valueMatches(
  field: FieldDescriptor,
  expected: FieldValue,
  actual: FieldValue | null,
): boolean {
  if (!actual || actual.kind !== expected.kind) return false
  if (expected.kind !== 'text' || actual.kind !== 'text') return fieldValuesEqual(expected, actual)
  if (collapse(expected.text) === collapse(actual.text)) return true
  if (field.type === 'tel') {
    const digits = expected.text.replace(/\D/g, '')
    return digits !== '' && digits === actual.text.replace(/\D/g, '')
  }
  if (field.type === 'combobox' || field.type === 'contenteditable')
    return normalizeValue(expected.text) === normalizeValue(actual.text)
  return false
}
