import {
  createDefaultSettings,
  PLUGIN_API_VERSION,
  type AutofillSettings,
  type FieldDescriptor,
  type FormActionPolicy,
  type MatchResult,
  type PolicyInput,
  type SyntheticGenerationResult,
} from '@ufa/core'
import { describe, expect, it, vi } from 'vitest'

import { evaluatePolicies, isTrustedSite, safetyPolicy } from './policy'
import { candidate, descriptor, matchResult } from './test-utils/targets'

const TRUSTED_SITE = 'jobs.example.com'

function settings(overrides: Partial<AutofillSettings> = {}): AutofillSettings {
  return {
    ...createDefaultSettings(),
    trusted: { minConfidence: 0.9, sites: ['example.com'] },
    ...overrides,
  }
}

function input(
  overrides: {
    field?: Partial<FieldDescriptor>
    match?: Partial<MatchResult>
    settings?: Partial<AutofillSettings>
    generated?: SyntheticGenerationResult | null
    site?: string
  } = {},
): PolicyInput {
  return {
    field: descriptor(overrides.field),
    match: matchResult(overrides.match),
    generated: overrides.generated ?? null,
    settings: settings(overrides.settings),
    site: overrides.site ?? TRUSTED_SITE,
  }
}

const trusted = { mode: 'trusted' } as const
const generatedValue = (valid = true): SyntheticGenerationResult => ({
  fieldId: 'f',
  generatorId: 'test',
  value: { kind: 'text', text: 'Generated' },
  source: 'generated',
  valid,
  validationMessage: valid ? null : 'Not a valid email address.',
  seed: null,
})

describe('safetyPolicy', () => {
  it.each([
    [
      'protected fields',
      input({ field: { sensitivity: 'prohibited', sensitivityReason: 'password' } }),
      'block',
      'Protected field (password): never filled.',
    ],
    [
      'unsupported controls',
      input({ field: { support: 'unsupported', unsupportedReason: 'Sliders are not supported yet.' } }),
      'block',
      'Sliders are not supported yet.',
    ],
    ['file uploads', input({ field: { type: 'file' } }), 'block', 'Files are never uploaded automatically.'],
    ['read-only fields', input({ field: { editable: false } }), 'block', 'The field cannot be edited.'],
    ['hidden fields', input({ field: { visible: false } }), 'skip', 'The field is hidden.'],
    [
      'fields without an answer',
      input({ match: { state: 'missing', best: null, reason: 'No saved answer fits "Phone".' } }),
      'skip',
      'No saved answer fits "Phone".',
    ],
    [
      'ambiguous fields',
      input({ match: { state: 'ambiguous', reason: '2 saved answers fit equally well.' } }),
      'suggest',
      '2 saved answers fit equally well.',
    ],
    [
      'incompatible answers',
      input({ match: { state: 'incompatible', reason: 'Your answer does not fit.' } }),
      'skip',
      'Your answer does not fit.',
    ],
    [
      'answers that cannot be expressed',
      input({ match: { best: candidate({ fillValue: null }) } }),
      'skip',
      'The answer cannot be expressed in this field.',
    ],
    [
      'fields that already hold the answer',
      input({ field: { hasValue: true, currentValue: { kind: 'text', text: 'Ada' } } }),
      'skip',
      'Already filled with this answer.',
    ],
    [
      'fields with another value',
      input({ field: { hasValue: true, currentValue: { kind: 'text', text: 'Grace' } } }),
      'skip',
      'Already has a value; it is kept.',
    ],
    [
      'fields with another value when overwriting is on',
      input({
        field: { hasValue: true, currentValue: { kind: 'text', text: 'Grace' } },
        settings: { overwriteExisting: true },
      }),
      'confirm',
      'Ready to fill when you select it.',
    ],
    [
      'consent fields, even in trusted mode on a trusted site',
      input({
        field: { sensitivity: 'consent', type: 'checkbox' },
        match: { best: candidate({ fillValue: { kind: 'checked', checked: true } }) },
        settings: trusted,
      }),
      'confirm',
      'Consent: changed only when you select this field yourself.',
    ],
    [
      'suggest mode',
      input({ settings: { mode: 'suggest' } }),
      'suggest',
      'Suggest mode shows answers without changing the page.',
    ],
    [
      'consent fields in suggest mode',
      input({ settings: { mode: 'suggest' }, field: { sensitivity: 'consent' } }),
      'suggest',
      'Suggest mode shows answers without changing the page.',
    ],
    ['review mode', input(), 'confirm', 'Ready to fill when you select it.'],
    [
      'medium-confidence matches in review mode',
      input({
        match: {
          state: 'suggested',
          best: candidate({ confidence: { score: 0.8, level: 'medium' } }),
        },
      }),
      'confirm',
      'Check this answer before you select it.',
    ],
    [
      'trusted mode on a trusted site',
      input({ settings: trusted }),
      'fill',
      'Trusted site and a high-confidence saved answer.',
    ],
    [
      'trusted mode on another site',
      input({ settings: trusted, site: 'example.org' }),
      'confirm',
      'Ready to fill when you select it.',
    ],
    [
      'trusted mode below the trusted confidence',
      input({
        settings: { mode: 'trusted', trusted: { minConfidence: 0.97, sites: ['example.com'] } },
      }),
      'confirm',
      'Ready to fill when you select it.',
    ],
    [
      'trusted mode with a suggested match',
      input({ settings: trusted, match: { state: 'suggested' } }),
      'confirm',
      'Check this answer before you select it.',
    ],
    [
      'trusted mode over an existing value',
      input({
        settings: { ...trusted, overwriteExisting: true },
        field: { hasValue: true, currentValue: { kind: 'text', text: 'Grace' } },
      }),
      'confirm',
      'Ready to fill when you select it.',
    ],
    [
      'generated values for consent fields',
      input({ field: { sensitivity: 'consent' }, generated: generatedValue() }),
      'block',
      'Consent fields never receive generated values.',
    ],
    [
      'invalid generated values',
      input({ generated: generatedValue(false) }),
      'skip',
      'Not a valid email address.',
    ],
    [
      'generated values, even in trusted mode',
      input({ generated: generatedValue(), settings: trusted, match: { state: 'missing', best: null } }),
      'confirm',
      'Generated value: fill it only if you select it.',
    ],
  ] as const)('decides on %s', (_name, policyInput, action, reason) => {
    expect(safetyPolicy(policyInput)).toEqual({ action, reason })
  })
})

function policy(evaluate: FormActionPolicy['evaluate'], id = 'test.policy'): FormActionPolicy {
  return { id, apiVersion: PLUGIN_API_VERSION, evaluate }
}

describe('evaluatePolicies', () => {
  it('lets a registered policy tighten the decision', () => {
    const noSalary = policy(({ field }) =>
      field.label === 'Salary' ? { action: 'block', reason: 'Salary stays private.' } : null,
    )
    expect(
      evaluatePolicies(input({ field: { label: 'Salary' } }), { policies: [noSalary] }),
    ).toEqual({ action: 'block', reason: 'Salary stays private.' })
    expect(evaluatePolicies(input(), { policies: [noSalary] })).toMatchObject({ action: 'confirm' })
  })

  it('never lets a policy loosen the built-in decision', () => {
    const permissive = policy(() => ({ action: 'fill', reason: 'Fill everything.' }))
    expect(
      evaluatePolicies(input({ field: { sensitivity: 'consent' } }), { policies: [permissive] }),
    ).toMatchObject({ action: 'confirm' })
    expect(
      evaluatePolicies(input({ field: { sensitivity: 'prohibited' } }), { policies: [permissive] }),
    ).toMatchObject({ action: 'block' })
  })

  it('blocks the field when a policy throws or returns something malformed', () => {
    const onPluginError = vi.fn()
    const throwing = policy(() => {
      throw new Error('boom')
    }, 'test.throwing')
    const malformed = policy(
      () => ({ action: 'allow', reason: 1 }) as unknown as ReturnType<FormActionPolicy['evaluate']>,
      'test.malformed',
    )
    for (const broken of [throwing, malformed]) {
      expect(evaluatePolicies(input(), { policies: [broken], onPluginError })).toEqual({
        action: 'block',
        reason: 'A policy plugin failed, so this field is left alone.',
      })
    }
    expect(onPluginError.mock.calls.map(([id]) => id)).toEqual(['test.throwing', 'test.malformed'])
  })
})

describe('isTrustedSite', () => {
  it.each([
    ['example.com', ['example.com'], true],
    ['jobs.example.com', ['example.com'], true],
    ['jobs.example.com', ['*.example.com'], true],
    ['JOBS.Example.com', [' example.com '], true],
    ['notexample.com', ['example.com'], false],
    ['example.com.evil.test', ['example.com'], false],
    ['example.com', [''], false],
    ['example.com', [], false],
  ] as const)('%s against %j is %s', (site, sites, expected) => {
    expect(isTrustedSite(site, sites)).toBe(expected)
  })
})
