import {
  isFieldValueEmpty,
  type AnswerValue,
  type FieldDescriptor,
  type FieldValue,
} from '@ufa/core'

/** Turns a live control value into something that can be stored as an answer. */
export function fieldValueToAnswerValue(
  field: FieldDescriptor,
  value: FieldValue,
): AnswerValue | null {
  if (isFieldValueEmpty(value)) return null
  switch (value.kind) {
    case 'text': {
      const text = value.text.trim()
      return text ? { kind: 'text', text } : null
    }
    case 'checked':
      return field.type === 'checkbox' ? { kind: 'boolean', value: value.checked } : null
    case 'options': {
      const labels = value.values
        .map((wanted) => field.options.find((option) => option.value === wanted)?.label ?? wanted)
        .filter((entry) => entry.trim() !== '')
      if (labels.length === 0) return null
      if (labels.length === 1) return { kind: 'text', text: labels[0]! }
      return { kind: 'list', items: labels }
    }
  }
}
