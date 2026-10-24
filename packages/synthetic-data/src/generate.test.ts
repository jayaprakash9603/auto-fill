import { describe, expect, it } from 'vitest'

import { generateForField } from './generate'

const field = {
  id: 'f1',
  fingerprint: 'fp',
  frameId: 0,
  order: 0,
  type: 'email' as const,
  label: 'Email',
  normalizedLabel: 'email',
  labelSource: 'label-for' as const,
  semanticKey: 'email',
  semanticConfidence: 0.9,
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

describe('generateForField', () => {
  it('returns nothing when synthetic mode is disabled', () => {
    expect(
      generateForField(field, {
        mode: 'review',
        activeProfileId: null,
        thresholds: { high: 0.9, medium: 0.7 },
        overwriteExisting: false,
        autoRescan: true,
        trusted: { minConfidence: 0.95, sites: [] },
        learning: { allowed: true },
        synthetic: {
          enabled: false,
          seed: 'test',
          allowedCategories: ['email'],
          fieldAllowlist: [],
          generatorOverrides: {},
        },
        clear: { includeSelects: true, includeChoiceControls: true },
        diagnostics: { enabled: false },
      }),
    ).toBeNull()
  })

  it('produces deterministic example.com email addresses from a seed', () => {
    const settings = {
      mode: 'review' as const,
      activeProfileId: null,
      thresholds: { high: 0.9, medium: 0.7 },
      overwriteExisting: false,
      autoRescan: true,
      trusted: { minConfidence: 0.95, sites: [] },
      learning: { allowed: true },
      synthetic: {
        enabled: true,
        seed: 'fixed-seed',
        allowedCategories: ['email' as const],
        fieldAllowlist: [],
        generatorOverrides: {},
      },
      clear: { includeSelects: true, includeChoiceControls: true },
      diagnostics: { enabled: false },
    }
    const a = generateForField(field, settings)
    const b = generateForField(field, settings)
    expect(a?.value).toEqual(b?.value)
    expect(a?.value).toMatchObject({ kind: 'text', text: expect.stringContaining('@example.com') })
    expect(a?.source).toBe('generated')
  })
})
