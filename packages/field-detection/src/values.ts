import type { FieldOption, FieldType, FieldValue } from '@ufa/core'

import { clip, isInput, isSelect, isTextArea } from './dom'
import { collapseWhitespace } from './text'

const MAX_VALUE_LENGTH = 20_000
const MAX_SELECTED = 500
/** Text a select-only combobox shows before anything is chosen. */
const PROMPT_TEXT = /^(select|choose|pick|please select)\b.{0,40}$|^[-–—\s]*$/i

function text(value: string): FieldValue {
  return { kind: 'text', text: clip(value, MAX_VALUE_LENGTH) }
}

function selected(options: readonly FieldOption[]): FieldValue {
  return {
    kind: 'options',
    values: options
      .filter((option) => option.selected)
      .slice(0, MAX_SELECTED)
      .map((option) => option.value),
  }
}

/**
 * Reads the current value of a control. Callers must not call this for prohibited fields: their
 * values are never read.
 */
export function readCurrentValue(
  type: FieldType,
  element: Element,
  options: readonly FieldOption[],
  placeholder: string | null,
): FieldValue | null {
  switch (type) {
    case 'file':
      return null
    case 'combobox': {
      if (isInput(element)) return text(element.value)
      const chosen = options.find((option) => option.selected)
      if (chosen) return text(chosen.label)
      const shown = collapseWhitespace(element.textContent ?? '')
      return text(shown === placeholder || PROMPT_TEXT.test(shown) ? '' : shown)
    }
    case 'select':
    case 'multiselect':
    case 'radio-group':
    case 'checkbox-group':
      return selected(options)
    case 'checkbox':
      return {
        kind: 'checked',
        checked: isInput(element)
          ? element.checked
          : element.getAttribute('aria-checked') === 'true',
      }
    default:
      break
  }
  if (isInput(element) || isTextArea(element)) return text(element.value)
  if (isSelect(element)) return selected(options)
  return text(collapseWhitespace(element.textContent ?? ''))
}
