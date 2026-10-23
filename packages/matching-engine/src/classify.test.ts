import {
  PLUGIN_API_VERSION,
  type CustomFieldDefinition,
  type FieldDescriptor,
  type SemanticClassifier,
} from '@ufa/core'
import { describe, expect, it, vi } from 'vitest'

import {
  CONFIDENCE,
  catalogClassifier,
  classifyField,
  createCustomFieldClassifier,
  isAboutAnotherPerson,
} from './classify'
import { field, options } from './test-utils/fixtures'

const classify = (overrides: Partial<FieldDescriptor>) =>
  classifyField(field(overrides), { classifiers: [catalogClassifier] })

describe('catalog classification', () => {
  it.each<[string, Partial<FieldDescriptor>, string, number, string]>([
    [
      'plain label',
      { label: 'First Name' },
      'firstName',
      CONFIDENCE.exactLabel,
      'label "First Name"',
    ],
    ['required marker', { label: 'First name *' }, 'firstName', CONFIDENCE.exactLabel, 'label'],
    ['noise word', { label: 'Candidate First Name' }, 'firstName', CONFIDENCE.exactLabel, 'label'],
    [
      'filler prefix',
      { label: 'Enter your first name' },
      'firstName',
      CONFIDENCE.exactLabel,
      'label',
    ],
    ['synonym', { label: 'Mobile number' }, 'phone', CONFIDENCE.exactLabel, 'label'],
    ['surname synonym', { label: 'Surname' }, 'lastName', CONFIDENCE.exactLabel, 'label'],
    [
      'autocomplete wins over the label',
      { label: 'Contact', autocomplete: 'section-work email', type: 'email' },
      'email',
      CONFIDENCE.autocomplete,
      'autocomplete="email"',
    ],
    [
      'identifier pattern',
      { label: 'Field 7', name: 'applicant[first_name]' },
      'firstName',
      CONFIDENCE.identifier,
      'field name "applicant[first_name]"',
    ],
    [
      'camelCase id',
      { label: '', htmlId: 'linkedInProfile' },
      'linkedinUrl',
      CONFIDENCE.identifier,
      'field name "linkedInProfile"',
    ],
    [
      'placeholder',
      { label: 'Details', placeholder: 'Your LinkedIn URL' },
      'linkedinUrl',
      CONFIDENCE.hint,
      'placeholder "Your LinkedIn URL"',
    ],
    [
      'contained phrase',
      { label: 'Link to your GitHub profile (optional)' },
      'githubUrl',
      CONFIDENCE.contains,
      'label mentions "github profile"',
    ],
    [
      'contained single word is weaker',
      { label: 'Volunteer experience details' },
      'yearsOfExperience',
      CONFIDENCE.containsWord,
      'label mentions "experience"',
    ],
    [
      'email input type',
      { label: 'Where can we reach you?', type: 'email' },
      'email',
      CONFIDENCE.inputType,
      'email input',
    ],
    [
      'tel input type',
      { label: 'Best number for you', type: 'tel' },
      'phone',
      CONFIDENCE.inputType,
      'phone input',
    ],
  ])('%s', (_name, overrides, key, confidence, reason) => {
    const result = classify(overrides)
    expect(result.semanticKey).toBe(key)
    expect(result.semanticConfidence).toBe(confidence)
    expect(result.semanticReason).toContain(reason)
  })

  it.each<[string, Partial<FieldDescriptor>]>([
    ['vague word inside a sentence', { label: 'State your reason for applying' }],
    ['vague "first"', { label: 'First day you could join our team' }],
    ['no evidence at all', { label: 'Favourite colour' }],
    [
      'checkbox labels are never read as contained phrases',
      { label: 'Email me about new jobs', type: 'checkbox' },
    ],
    ['key restricted to other control types', { label: 'Cover letter', type: 'url' }],
  ])('leaves the field unclassified: %s', (_name, overrides) => {
    expect(classify(overrides).semanticKey).toBeNull()
  })

  it('does not apply a key whose declared types exclude a formatted input', () => {
    expect(classify({ label: 'Email', type: 'number' }).semanticKey).toBeNull()
  })

  it.each<[string, Partial<FieldDescriptor>]>([
    ['emergency contact section', { label: 'Name', section: 'Emergency contact' }],
    ['referee label', { label: 'Referee email', type: 'email' }],
    ['next of kin section', { label: 'Phone number', section: 'Next of kin' }],
    ['manager label', { label: "Manager's full name" }],
  ])('never gives personal keys to fields about someone else: %s', (_name, overrides) => {
    const result = classify(overrides)
    expect(result.semanticKey).toBeNull()
  })

  it('still classifies non-personal questions in those sections', () => {
    expect(classify({ label: 'Country', section: 'Emergency contact' }).semanticKey).toBeNull()
    expect(classify({ label: 'Years of experience', section: 'Reference check' }).semanticKey).toBe(
      'yearsOfExperience',
    )
  })

  it('detects other-person wording in sections and labels', () => {
    expect(isAboutAnotherPerson({ section: 'Emergency contact details', label: 'Name' })).toBe(true)
    expect(isAboutAnotherPerson({ section: 'About you', label: 'Name' })).toBe(false)
  })

  it('never classifies protected fields', () => {
    const secret = field({
      label: 'Email',
      sensitivity: 'prohibited',
      sensitivityReason: 'password',
    })
    expect(classifyField(secret, { classifiers: [catalogClassifier] })).toBe(secret)
  })

  it('keeps a key set more confidently by a portal adapter', () => {
    const adapted = field({ label: 'Name', semanticKey: 'preferredName', semanticConfidence: 0.99 })
    expect(classifyField(adapted, { classifiers: [catalogClassifier] }).semanticKey).toBe(
      'preferredName',
    )
  })

  it('replaces a weaker existing key', () => {
    const weak = field({ label: 'First name', semanticKey: 'fullName', semanticConfidence: 0.5 })
    expect(classifyField(weak, { classifiers: [catalogClassifier] }).semanticKey).toBe('firstName')
  })

  it('reads select options without matching against them', () => {
    const result = classify({ label: 'Gender', type: 'select', options: options('Female', 'Male') })
    expect(result.semanticKey).toBe('gender')
  })
})

describe('custom field classification', () => {
  const custom: CustomFieldDefinition = {
    key: 'custom:preferred-office',
    label: 'Preferred office',
    description: '',
    aliases: [{ text: 'Office location', normalized: 'office location' }],
    category: 'preferences',
    controlTypes: [],
    createdAt: 1,
    updatedAt: 1,
  }

  it('uses the label and aliases of the user’s own fields', () => {
    const result = classifyField(field({ label: 'Office location' }), {
      classifiers: [createCustomFieldClassifier([custom]), catalogClassifier],
    })
    expect(result.semanticKey).toBe('custom:preferred-office')
    expect(result.semanticReason).toBe('label "Office location" (your field "Preferred office")')
  })

  it('lets the catalog win when it is more confident', () => {
    const result = classifyField(
      field({ label: 'Office location', autocomplete: 'address-level2' }),
      {
        classifiers: [createCustomFieldClassifier([custom]), catalogClassifier],
      },
    )
    expect(result.semanticKey).toBe('city')
  })

  it('isolates a failing classifier plugin', () => {
    const onPluginError = vi.fn()
    const broken: SemanticClassifier = {
      id: 'broken',
      apiVersion: PLUGIN_API_VERSION,
      order: 1,
      classify() {
        throw new Error('boom')
      },
    }
    const result = classifyField(field({ label: 'Email' }), {
      classifiers: [broken, catalogClassifier],
      onPluginError,
    })
    expect(result.semanticKey).toBe('email')
    expect(onPluginError).toHaveBeenCalledWith('broken', expect.any(Error))
  })

  it('ignores plugin results with invalid confidence', () => {
    const invalid: SemanticClassifier = {
      id: 'invalid',
      apiVersion: PLUGIN_API_VERSION,
      order: 1,
      classify: () => ({ key: 'gpa', confidence: Number.NaN, reason: 'nan' }),
    }
    const result = classifyField(field({ label: 'Email' }), {
      classifiers: [invalid, catalogClassifier],
    })
    expect(result.semanticKey).toBe('email')
  })
})
