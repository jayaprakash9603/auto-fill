import { isFieldValueEmpty, type ClearOperation, type FieldDescriptor, type FieldValue } from '@ufa/core'

/** Value that empties the control for verification and fill adapters. */
export function emptyValueFor(field: FieldDescriptor): FieldValue | null {
  switch (field.type) {
    case 'checkbox':
      return { kind: 'checked', checked: false }
    case 'radio-group':
    case 'checkbox-group':
    case 'select':
    case 'multiselect':
    case 'combobox':
      return { kind: 'options', values: [] }
    case 'file':
    case 'password':
    case 'range':
    case 'color':
    case 'unknown':
      return null
    default:
      return { kind: 'text', text: '' }
  }
}

export function clearRefusalReason(field: FieldDescriptor, operation: ClearOperation): string | null {
  if (field.sensitivity === 'prohibited')
    return `Protected field (${field.sensitivityReason ?? 'sensitive'}): never cleared.`
  if (field.support === 'unsupported')
    return field.unsupportedReason ?? 'This control is not supported.'
  if (field.type === 'file') return 'Files are never cleared automatically.'
  if (!field.visible) return 'The field is hidden.'
  if (!field.editable) return 'The field cannot be edited.'
  if (field.sensitivity === 'consent' && !operation.explicitlySelected)
    return 'Consent fields change only when you select them yourself.'
  if (!field.hasValue && isFieldValueEmpty(field.currentValue))
    return 'The field is already empty.'
  if (emptyValueFor(field) === null) return 'This control cannot be cleared.'
  return null
}
