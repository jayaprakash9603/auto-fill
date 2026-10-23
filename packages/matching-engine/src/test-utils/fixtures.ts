import {
  normalizeLabel,
  normalizeValue,
  type AnswerContext,
  type AnswerRecord,
  type AnswerValue,
  type FieldDescriptor,
  type FieldOption,
} from '@ufa/core'

export function option(
  label: string,
  value = label,
  extra: Partial<FieldOption> = {},
): FieldOption {
  return {
    value,
    label,
    normalizedLabel: normalizeValue(label),
    selected: false,
    disabled: false,
    ...extra,
  }
}

export const options = (...labels: string[]) => labels.map((label) => option(label))

let fieldCount = 0

export function field(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  fieldCount += 1
  const label = overrides.label ?? 'Field'
  return {
    id: `f${fieldCount}`,
    fingerprint: `fp${fieldCount}`,
    frameId: null,
    order: fieldCount,
    type: 'text',
    labelSource: 'label-for',
    semanticKey: null,
    semanticConfidence: 0,
    semanticReason: null,
    placeholder: null,
    name: null,
    htmlId: null,
    autocomplete: null,
    inputMode: null,
    maxLength: null,
    aria: {
      role: null,
      label: null,
      description: null,
      required: false,
      invalid: false,
      expanded: null,
      controls: null,
    },
    section: null,
    formTitle: null,
    required: false,
    visible: true,
    editable: true,
    hasValue: false,
    currentValue: null,
    options: [],
    multiple: false,
    sensitivity: 'normal',
    sensitivityReason: null,
    support: 'supported',
    unsupportedReason: null,
    detectorId: 'test',
    detectionConfidence: 1,
    portalAdapterId: null,
    inShadowRoot: false,
    ...overrides,
    label,
    normalizedLabel: overrides.normalizedLabel ?? normalizeLabel(label),
  }
}

export const text = (value: string): AnswerValue => ({ kind: 'text', text: value })
export const yes: AnswerValue = { kind: 'boolean', value: true }
export const no: AnswerValue = { kind: 'boolean', value: false }
export const list = (...items: string[]): AnswerValue => ({ kind: 'list', items })

export type AnswerOverrides = Omit<Partial<AnswerRecord>, 'context' | 'aliases' | 'value'> & {
  context?: Partial<AnswerContext>
  aliases?: string[]
  value?: AnswerValue | string
}

export function answer(id: string, label: string, overrides: AnswerOverrides = {}): AnswerRecord {
  const { context, aliases, value, ...rest } = overrides
  return {
    id,
    label,
    semanticKey: null,
    profileId: null,
    category: 'custom',
    controlTypes: [],
    tags: [],
    preferred: false,
    source: 'manual',
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: null,
    usageCount: 0,
    ...rest,
    value: typeof value === 'string' ? text(value) : (value ?? text(`${label} value`)),
    aliases: (aliases ?? []).map((alias) => ({ text: alias, normalized: normalizeLabel(alias) })),
    context: { sites: [], sectionKeywords: [], formKeywords: [], applicationTypes: [], ...context },
  }
}
