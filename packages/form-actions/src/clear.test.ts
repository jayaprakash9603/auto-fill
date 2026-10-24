import type { FieldDescriptor } from '@ufa/core'
import { describe, expect, it } from 'vitest'

import { clearRefusalReason, emptyValueFor } from './clear'

function field(overrides: Partial<FieldDescriptor>): FieldDescriptor {
  return {
    id: 'f1',
    fingerprint: 'fp',
    frameId: 0,
    order: 0,
    type: 'text',
    label: 'Name',
    normalizedLabel: 'name',
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
    hasValue: true,
    currentValue: { kind: 'text', text: 'Ada' },
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
  }
}

describe('emptyValueFor', () => {
  it('returns empty text for text inputs and empty options for selects', () => {
    expect(emptyValueFor(field({ type: 'text' }))).toEqual({ kind: 'text', text: '' })
    expect(emptyValueFor(field({ type: 'select' }))).toEqual({ kind: 'options', values: [] })
    expect(emptyValueFor(field({ type: 'checkbox' }))).toEqual({ kind: 'checked', checked: false })
    expect(emptyValueFor(field({ type: 'password' }))).toBeNull()
  })
})

describe('clearRefusalReason', () => {
  it('refuses protected, unsupported, and already-empty fields', () => {
    const op = { fieldId: 'f1', explicitlySelected: true, requireRestorable: false }
    expect(clearRefusalReason(field({ sensitivity: 'prohibited' }), op)).toMatch(/Protected/)
    expect(clearRefusalReason(field({ support: 'unsupported' }), op)).toMatch(/not supported/)
    expect(
      clearRefusalReason(
        field({ hasValue: false, currentValue: { kind: 'text', text: '' } }),
        op,
      ),
    ).toMatch(/already empty/)
  })
})
