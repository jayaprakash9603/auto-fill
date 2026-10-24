import { describe, expect, it } from 'vitest'

import { fieldValueToAnswerValue } from './convert'
import { shouldCaptureLearning } from './capture'
import { findDuplicateAnswerId } from './dedupe'

const field = {
  id: 'f1',
  fingerprint: 'fp',
  frameId: 0,
  order: 0,
  type: 'text' as const,
  label: 'Portfolio URL',
  normalizedLabel: 'portfolio url',
  labelSource: 'label-for' as const,
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
  sensitivity: 'normal' as const,
  sensitivityReason: null,
  support: 'supported' as const,
  unsupportedReason: null,
  detectorId: 'test',
  detectionConfidence: 1,
  portalAdapterId: null,
  inShadowRoot: false,
}

describe('learning capture', () => {
  it('accepts missing fields and rejects matched ones', () => {
    expect(
      shouldCaptureLearning({
        field,
        match: { fieldId: 'f1', state: 'missing', reason: null, best: null, candidates: [] },
        value: { kind: 'text', text: 'https://example.com' },
        learningAllowed: true,
      }),
    ).toBeNull()
    expect(
      shouldCaptureLearning({
        field,
        match: {
          fieldId: 'f1',
          state: 'matched',
          reason: null,
          best: null,
          candidates: [],
        },
        value: { kind: 'text', text: 'x' },
        learningAllowed: true,
      }),
    ).toMatch(/already has/)
  })

  it('converts values and finds duplicate answers', () => {
    const value = fieldValueToAnswerValue(field, { kind: 'text', text: '  hello  ' })
    expect(value).toEqual({ kind: 'text', text: 'hello' })
    const duplicate = findDuplicateAnswerId(field, { kind: 'text', text: 'Hello' }, [
      {
        id: 'a1',
        label: 'Portfolio URL',
        semanticKey: null,
        aliases: [],
        value: { kind: 'text', text: 'hello' },
        profileId: null,
        category: 'links',
        controlTypes: [],
        context: {
          sites: [],
          sectionKeywords: [],
          formKeywords: [],
          applicationTypes: [],
        },
        tags: [],
        preferred: false,
        source: 'manual',
        createdAt: 0,
        updatedAt: 0,
        lastUsedAt: null,
        usageCount: 0,
      },
    ])
    expect(duplicate).toBe('a1')
  })
})
