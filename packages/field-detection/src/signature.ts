import type { FieldDescriptor } from '@ufa/core'

/**
 * Structural signature of a field list: which controls exist, what they ask and whether they can
 * be used. Values are deliberately excluded so typing never counts as a structural change.
 */
export function fieldsSignature(fields: readonly FieldDescriptor[]): string {
  return fields
    .map((field) =>
      [
        field.id,
        field.fingerprint,
        field.visible ? 1 : 0,
        field.editable ? 1 : 0,
        field.required ? 1 : 0,
        field.support,
        field.section ?? '',
        field.options.length,
      ].join(':'),
    )
    .join('|')
}
