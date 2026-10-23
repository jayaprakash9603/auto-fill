import { z } from 'zod'

export const FIELD_TYPES = [
  'text',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'search',
  'password',
  'textarea',
  'select',
  'multiselect',
  'checkbox',
  'checkbox-group',
  'radio-group',
  'combobox',
  'contenteditable',
  'file',
  'range',
  'color',
  'unknown',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]
export const fieldTypeSchema = z.enum(FIELD_TYPES)

/** Controls whose value is free text (possibly with a format constraint). */
export const TEXT_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'text',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'search',
  'textarea',
  'contenteditable',
  'combobox',
])

/** Controls whose value must be one or more of a fixed option list. */
export const CHOICE_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'select',
  'multiselect',
  'radio-group',
  'checkbox-group',
])

/** A concrete value for a specific control: text, a checkbox state, or option values. */
export type FieldValue =
  | { kind: 'text'; text: string }
  | { kind: 'checked'; checked: boolean }
  | { kind: 'options'; values: string[] }

export const fieldValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().max(20_000) }),
  z.object({ kind: z.literal('checked'), checked: z.boolean() }),
  z.object({ kind: z.literal('options'), values: z.array(z.string().max(2_000)).max(500) }),
])

export interface FieldOption {
  value: string
  label: string
  normalizedLabel: string
  selected: boolean
  disabled: boolean
}

export const fieldOptionSchema = z.object({
  value: z.string().max(2_000),
  label: z.string().max(2_000),
  normalizedLabel: z.string().max(2_000),
  selected: z.boolean(),
  disabled: z.boolean(),
})

export const LABEL_SOURCES = [
  'aria-labelledby',
  'aria-label',
  'label-for',
  'label-wrap',
  'legend',
  'group-aria',
  'title',
  'placeholder',
  'adjacent-text',
  'name',
  'adapter',
  'none',
] as const
export type LabelSource = (typeof LABEL_SOURCES)[number]
export const labelSourceSchema = z.enum(LABEL_SOURCES)

export const FIELD_SENSITIVITIES = ['normal', 'consent', 'prohibited'] as const
/**
 * `prohibited`: passwords, OTPs, payment and auth data. Never read, filled, cleared, learned or generated.
 * `consent`: terms, declarations and certifications. Never changed without an explicit per-field selection.
 */
export type FieldSensitivity = (typeof FIELD_SENSITIVITIES)[number]
export const fieldSensitivitySchema = z.enum(FIELD_SENSITIVITIES)

export interface FieldAria {
  role: string | null
  label: string | null
  description: string | null
  required: boolean
  invalid: boolean
  expanded: boolean | null
  controls: string | null
}

export const fieldAriaSchema = z.object({
  role: z.string().nullable(),
  label: z.string().nullable(),
  description: z.string().nullable(),
  required: z.boolean(),
  invalid: z.boolean(),
  expanded: z.boolean().nullable(),
  controls: z.string().nullable(),
})

/** Everything known about one form control, without any reference to the DOM element itself. */
export interface FieldDescriptor {
  /** Stable for the lifetime of the page session; revalidated against `fingerprint` before actions. */
  id: string
  fingerprint: string
  frameId: number | null
  order: number
  type: FieldType
  label: string
  normalizedLabel: string
  labelSource: LabelSource
  semanticKey: string | null
  semanticConfidence: number
  /** Why the key was chosen, e.g. `autocomplete="email"`. Null when unclassified. */
  semanticReason: string | null
  placeholder: string | null
  name: string | null
  htmlId: string | null
  autocomplete: string | null
  inputMode: string | null
  maxLength: number | null
  aria: FieldAria
  section: string | null
  formTitle: string | null
  required: boolean
  visible: boolean
  editable: boolean
  hasValue: boolean
  /** Always null for prohibited fields: their values are never read. */
  currentValue: FieldValue | null
  options: FieldOption[]
  multiple: boolean
  sensitivity: FieldSensitivity
  sensitivityReason: string | null
  support: 'supported' | 'unsupported'
  unsupportedReason: string | null
  detectorId: string
  detectionConfidence: number
  portalAdapterId: string | null
  inShadowRoot: boolean
}

export const fieldDescriptorSchema = z.object({
  id: z.string().min(1).max(200),
  fingerprint: z.string().max(200),
  frameId: z.number().int().nonnegative().nullable(),
  order: z.number().int().nonnegative(),
  type: fieldTypeSchema,
  label: z.string().max(1_000),
  normalizedLabel: z.string().max(1_000),
  labelSource: labelSourceSchema,
  semanticKey: z.string().max(120).nullable(),
  semanticConfidence: z.number().min(0).max(1),
  semanticReason: z.string().max(300).nullable().default(null),
  placeholder: z.string().max(1_000).nullable(),
  name: z.string().max(500).nullable(),
  htmlId: z.string().max(500).nullable(),
  autocomplete: z.string().max(200).nullable(),
  inputMode: z.string().max(50).nullable(),
  maxLength: z.number().int().nullable(),
  aria: fieldAriaSchema,
  section: z.string().max(500).nullable(),
  formTitle: z.string().max(500).nullable(),
  required: z.boolean(),
  visible: z.boolean(),
  editable: z.boolean(),
  hasValue: z.boolean(),
  currentValue: fieldValueSchema.nullable(),
  options: z.array(fieldOptionSchema).max(2_000),
  multiple: z.boolean(),
  sensitivity: fieldSensitivitySchema,
  sensitivityReason: z.string().max(200).nullable(),
  support: z.enum(['supported', 'unsupported']),
  unsupportedReason: z.string().max(300).nullable(),
  detectorId: z.string().max(100),
  detectionConfidence: z.number().min(0).max(1),
  portalAdapterId: z.string().max(100).nullable(),
  inShadowRoot: z.boolean(),
})

export function isTextFieldType(type: FieldType): boolean {
  return TEXT_FIELD_TYPES.has(type)
}

export function isChoiceFieldType(type: FieldType): boolean {
  return CHOICE_FIELD_TYPES.has(type)
}

export function isFieldValueEmpty(value: FieldValue | null): boolean {
  if (!value) return true
  switch (value.kind) {
    case 'text':
      return value.text.trim() === ''
    case 'checked':
      return !value.checked
    case 'options':
      return value.values.every((entry) => entry === '')
  }
}

export function fieldValuesEqual(a: FieldValue | null, b: FieldValue | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'text':
      return a.text === (b as typeof a).text
    case 'checked':
      return a.checked === (b as typeof a).checked
    case 'options': {
      const other = (b as typeof a).values
      return (
        a.values.length === other.length &&
        [...a.values].sort().join('\u0000') === [...other].sort().join('\u0000')
      )
    }
  }
}

export function describeFieldValue(value: FieldValue | null): string {
  if (!value) return ''
  switch (value.kind) {
    case 'text':
      return value.text
    case 'checked':
      return value.checked ? 'Checked' : 'Unchecked'
    case 'options':
      return value.values.join(', ')
  }
}
