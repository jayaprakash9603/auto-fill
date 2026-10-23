import { afterEach, describe, expect, it } from 'vitest'

import { fieldDescriptorSchema, type FieldDescriptor, type ScanRequestInput } from '@ufa/core'

import { createFieldScanner } from './scanner'
import { loadFixture, type LoadedFixture } from './test-utils/fixtures'

const opened: LoadedFixture[] = []
afterEach(() => opened.splice(0).forEach((fixture) => fixture.close()))

function scanFixture(name: string, request?: ScanRequestInput) {
  const fixture = loadFixture(name)
  opened.push(fixture)
  const scanner = createFieldScanner({ document: fixture.document, idPrefix: 't' })
  return { fixture, scanner, fields: scanner.scan(request) }
}

type Row = Pick<FieldDescriptor, 'label' | 'type' | 'labelSource' | 'section' | 'required'>

function rows(fields: readonly FieldDescriptor[]): Row[] {
  return fields.map(({ label, type, labelSource, section, required }) => ({
    label,
    type,
    labelSource,
    section,
    required,
  }))
}

function byLabel(fields: readonly FieldDescriptor[], label: string): FieldDescriptor {
  const field = fields.find((entry) => entry.label === label)
  if (!field) throw new Error(`No field labelled "${label}"`)
  return field
}

describe('field scanner: simple application', () => {
  it('detects native controls, radio groups and consent checkboxes in document order', () => {
    const { fields } = scanFixture('simple-application.html')
    expect(rows(fields)).toEqual([
      {
        label: 'First name',
        type: 'text',
        labelSource: 'label-for',
        section: 'Personal information',
        required: true,
      },
      {
        label: 'Last name',
        type: 'text',
        labelSource: 'label-for',
        section: 'Personal information',
        required: true,
      },
      {
        label: 'Email address',
        type: 'email',
        labelSource: 'label-for',
        section: 'Personal information',
        required: false,
      },
      {
        label: 'Phone',
        type: 'tel',
        labelSource: 'label-for',
        section: 'Personal information',
        required: false,
      },
      {
        label: 'Will you now or in the future require sponsorship?',
        type: 'radio-group',
        labelSource: 'adjacent-text',
        section: 'Work authorization',
        required: false,
      },
      {
        label: 'Country',
        type: 'select',
        labelSource: 'label-for',
        section: null,
        required: false,
      },
      {
        label: 'I agree to the terms and conditions',
        type: 'checkbox',
        labelSource: 'label-wrap',
        section: null,
        required: false,
      },
    ])
  })

  it('produces schema-valid descriptors with stable, unique, ordered ids', () => {
    const { fields } = scanFixture('simple-application.html')
    for (const field of fields) expect(fieldDescriptorSchema.parse(field)).toEqual(field)
    expect(new Set(fields.map((field) => field.id)).size).toBe(fields.length)
    expect(fields.map((field) => field.order)).toEqual(fields.map((_, index) => index))
    expect(fields.every((field) => field.id.startsWith('t-'))).toBe(true)
    expect(fields.every((field) => field.formTitle === 'Apply for Software Engineer')).toBe(true)
  })

  it('describes options, current values, autocomplete and sensitivity', () => {
    const { fields } = scanFixture('simple-application.html')
    const sponsorship = byLabel(fields, 'Will you now or in the future require sponsorship?')
    expect(sponsorship.options.map(({ value, label }) => [value, label])).toEqual([
      ['yes', 'Yes'],
      ['no', 'No'],
    ])
    expect(sponsorship.currentValue).toEqual({ kind: 'options', values: [] })

    const country = byLabel(fields, 'Country')
    expect(country.options).toHaveLength(4)
    expect(country.options[1]).toMatchObject({
      value: 'US',
      label: 'United States',
      normalizedLabel: 'united states',
    })
    expect(country.hasValue).toBe(false)

    expect(byLabel(fields, 'First name').autocomplete).toBe('given-name')
    const terms = byLabel(fields, 'I agree to the terms and conditions')
    expect(terms).toMatchObject({
      sensitivity: 'consent',
      currentValue: { kind: 'checked', checked: false },
    })
    expect(fields.filter((field) => field.sensitivity === 'normal')).toHaveLength(6)
  })
})

describe('field scanner: ARIA widgets', () => {
  it('detects custom widgets, folds owned listboxes into comboboxes and flags unsupported ones', () => {
    const { fields } = scanFixture('aria-widgets.html')
    expect(
      fields.map(({ label, type, labelSource, support }) => [label, type, labelSource, support]),
    ).toEqual([
      ['Cover letter', 'contenteditable', 'aria-labelledby', 'supported'],
      ['Years of experience', 'combobox', 'aria-labelledby', 'supported'],
      ['City', 'combobox', 'label-for', 'supported'],
      ['Application reference', 'text', 'aria-label', 'unsupported'],
      ['Are you willing to relocate?', 'radio-group', 'group-aria', 'supported'],
      ['Open to remote work', 'checkbox', 'aria-labelledby', 'supported'],
      ['Subscribe to job alerts', 'checkbox', 'aria-labelledby', 'supported'],
      ['Preferred locations', 'multiselect', 'aria-label', 'supported'],
      ['Salary expectation', 'range', 'aria-label', 'unsupported'],
      ['Notice period in weeks', 'number', 'aria-label', 'unsupported'],
    ])
    expect(new Set(fields.map((field) => field.formTitle))).toEqual(
      new Set(['Custom widget application form']),
    )
    expect(fields.slice(0, 4).every((field) => field.section === 'Experience')).toBe(true)
    expect(fields.slice(4).every((field) => field.section === 'Preferences')).toBe(true)
  })

  it('reads ARIA state for options and values', () => {
    const { fields } = scanFixture('aria-widgets.html')
    const experience = byLabel(fields, 'Years of experience')
    expect(experience).toMatchObject({ required: true, hasValue: false })
    expect(experience.options.map((option) => option.value)).toEqual(['0-2', '3-5', '6+'])
    expect(byLabel(fields, 'City').options.map((option) => option.label)).toEqual([
      'Bengaluru',
      'London',
      'New York',
    ])
    expect(byLabel(fields, 'Are you willing to relocate?').currentValue).toEqual({
      kind: 'options',
      values: ['no'],
    })
    expect(byLabel(fields, 'Open to remote work').currentValue).toEqual({
      kind: 'checked',
      checked: true,
    })
    expect(byLabel(fields, 'Subscribe to job alerts').sensitivity).toBe('consent')
    const locations = byLabel(fields, 'Preferred locations')
    expect(locations.multiple).toBe(true)
    expect(locations.currentValue).toEqual({ kind: 'options', values: ['Remote'] })
    expect(locations.options[2]).toMatchObject({ label: 'On-site', disabled: true })
    expect(byLabel(fields, 'Salary expectation').unsupportedReason).toMatch(/slider/i)
  })
})

describe('field scanner: shadow DOM', () => {
  it('finds controls in open (and nested) shadow roots with their context, but not closed ones', () => {
    const { fields, scanner } = scanFixture('shadow-dom.html')
    expect(
      fields.map(({ label, type, section, inShadowRoot }) => [label, type, section, inShadowRoot]),
    ).toEqual([
      ['Full name', 'text', 'Contact', true],
      ['Email', 'email', 'Contact', true],
      ['City', 'text', 'Address', true],
      ['Postal code', 'text', 'Address', true],
      ['Are you at least 18 years old?', 'radio-group', 'Address', true],
      ['Notes', 'textarea', 'Address', false],
    ])
    expect(byLabel(fields, 'Full name')).toMatchObject({ required: true, name: 'fullName' })
    expect(byLabel(fields, 'Are you at least 18 years old?').labelSource).toBe('legend')
    expect(fields.some((field) => field.label === 'Closed component')).toBe(false)
    expect(scanner.shadowRoots).toHaveLength(6)
    expect(fields.every((field) => field.formTitle === 'Component library application')).toBe(true)
  })
})

describe('field scanner: heuristic labels', () => {
  it('labels controls from tables, layout siblings, definitions, attributes and names', () => {
    const { fields } = scanFixture('heuristic-labels.html')
    const sources = Object.fromEntries(fields.map((field) => [field.label, field.labelSource]))
    expect(sources).toMatchObject({
      Company: 'adjacent-text',
      'Job title': 'adjacent-text',
      Degree: 'adjacent-text',
      School: 'adjacent-text',
      'Current salary': 'adjacent-text',
      'Notice period': 'adjacent-text',
      'Expected start date': 'adjacent-text',
      Website: 'placeholder',
      'previous employer': 'name',
      'Middle name': 'title',
      'Preferred name': 'aria-label',
      'Phone (mobile)': 'aria-labelledby',
      'applicant linkedin url': 'name',
      City: 'label-for',
      'Postal code': 'label-for',
      'Date of birth': 'legend',
      'Create a password': 'label-for',
      'Verification code': 'label-for',
      '': 'none',
    })
    expect(byLabel(fields, 'Company').section).toBe('Current role')
    expect(byLabel(fields, 'Date of birth').section).toBe('About you')
  })

  it('reads required markers hidden from assistive technology and help text', () => {
    const { fields } = scanFixture('heuristic-labels.html')
    expect(byLabel(fields, 'City').required).toBe(true)
    expect(byLabel(fields, 'Postal code')).toMatchObject({
      required: true,
      aria: { description: 'Used to show nearby offices.' },
    })
    expect(byLabel(fields, 'Company').required).toBe(false)
  })

  it('never reads prohibited values and reports them as protected', () => {
    const { fields, fixture } = scanFixture('heuristic-labels.html')
    expect(fixture.document.querySelector<HTMLInputElement>('#password')?.value).toBe(
      'not-a-real-secret',
    )
    const password = byLabel(fields, 'Create a password')
    expect(password).toMatchObject({
      sensitivity: 'prohibited',
      currentValue: null,
      hasValue: false,
      options: [],
    })
    expect(byLabel(fields, 'Verification code')).toMatchObject({
      sensitivity: 'prohibited',
      sensitivityReason: 'autocomplete=one-time-code',
    })
    expect(JSON.stringify(fields)).not.toContain('not-a-real-secret')
  })

  it('skips honeypots, read-only and disabled controls unless asked', () => {
    const { fields } = scanFixture('heuristic-labels.html')
    const labels = fields.map((field) => field.label)
    expect(labels).not.toContain('Leave this empty')
    expect(labels).not.toContain('Referral code')
    expect(labels).not.toContain('Office notes')

    const all = scanFixture('heuristic-labels.html', { includeHidden: true, includeDisabled: true })
    expect(byLabel(all.fields, 'Leave this empty').visible).toBe(false)
    expect(byLabel(all.fields, 'Referral code')).toMatchObject({
      editable: false,
      currentValue: { kind: 'text', text: 'R-2048' },
    })
    expect(byLabel(all.fields, 'Office notes').editable).toBe(false)
  })
})

describe('field scanner: multi-step forms', () => {
  it('lists only the visible step and picks up revealed and inserted controls on rescan', () => {
    const { fixture, scanner, fields } = scanFixture('multi-step.html')
    const doc = fixture.document
    expect(fields.map((field) => field.label)).toEqual([
      'Full name',
      'Email',
      'I was referred by an employee',
    ])
    expect(fields[0]?.section).toBe('Step 1: About you')

    doc.querySelector<HTMLInputElement>('#has-referral')!.click()
    const withReferral = scanner.scan()
    expect(withReferral.map((field) => field.label)).toContain('Referrer name')
    expect(withReferral[0]?.id).toBe(fields[0]?.id)

    doc.querySelector<HTMLButtonElement>('#to-step-2')!.click()
    expect(scanner.scan().map((field) => field.label)).toEqual([
      'Years of experience',
      'Portfolio URL',
    ])

    doc.querySelector<HTMLButtonElement>('#to-step-3')!.click()
    const step3 = scanner.scan()
    expect(step3.map(({ label, type, section }) => [label, type, section])).toEqual([
      ['Why do you want to join?', 'textarea', 'Step 3: Motivation'],
    ])

    const everything = scanner.scan({ includeHidden: true })
    expect(everything.find((field) => field.label === 'Full name')?.id).toBe(fields[0]?.id)
  })
})
