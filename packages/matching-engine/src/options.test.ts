import { describe, expect, it } from 'vitest'

import {
  isPlaceholderOption,
  matchOption,
  parseRange,
  singleNumber,
  type OptionMatch,
} from './options'
import { option, options } from './test-utils/fixtures'

const picked = (result: OptionMatch) =>
  result.kind === 'match' ? `${result.method}:${result.option.label}` : result.kind

const YES_NO = [option('Select…', ''), option('Yes'), option('No')]
const YEARS = options('0-1 years', '1-3 years', '3-5 years', '5+ years')
const WORDY_YEARS = options('Less than 1 year', '1 to 2 years', 'More than 2 years')
const COUNTRIES = [
  option('India', 'IN'),
  option('United States of America', 'US'),
  option('United Kingdom', 'GB'),
]
const SPONSORSHIP = options('Yes, I will require sponsorship', 'No, I will not require sponsorship')

describe('matchOption', () => {
  it.each<[string, readonly ReturnType<typeof option>[], string, string]>([
    ['exact value', COUNTRIES, 'IN', 'value:India'],
    ['label ignoring case and accents', COUNTRIES, 'INDIA', 'label:India'],
    ['normalized value', COUNTRIES, 'us', 'label:United States of America'],
    ['yes from a yes/no select', YES_NO, 'Yes', 'value:Yes'],
    ['lowercase yes', YES_NO, 'yes', 'label:Yes'],
    ['short yes', YES_NO, 'y', 'yes-no:Yes'],
    ['spoken no', YES_NO, "I don't", 'yes-no:No'],
    ['yes in a sentence option', SPONSORSHIP, 'Yes', 'yes-no:Yes, I will require sponsorship'],
    ['no in a sentence option', SPONSORSHIP, 'No', 'yes-no:No, I will not require sponsorship'],
    ['number inside a range', YEARS, '4', 'range:3-5 years'],
    ['shared boundary reads as half-open', YEARS, '3', 'range:3-5 years'],
    ['lower boundary', YEARS, '1', 'range:1-3 years'],
    ['fraction', YEARS, '0.5', 'range:0-1 years'],
    ['open-ended range with unit', YEARS, '7 years', 'range:5+ years'],
    ['less than', WORDY_YEARS, '0', 'range:Less than 1 year'],
    ['"to" range upper bound', WORDY_YEARS, '2', 'range:1 to 2 years'],
    ['more than', WORDY_YEARS, '3', 'range:More than 2 years'],
    ['partial label', COUNTRIES, 'United States', 'contains:United States of America'],
    ['answer containing the label', COUNTRIES, 'Bengaluru, India', 'contains:India'],
  ])('%s', (_name, choices, wanted, expected) => {
    expect(picked(matchOption(choices, wanted))).toBe(expected)
  })

  it.each<[string, readonly ReturnType<typeof option>[], string, string]>([
    ['two options contain the answer', COUNTRIES, 'United', 'ambiguous'],
    ['no option fits', COUNTRIES, 'France', 'none'],
    ['empty answer', COUNTRIES, '  ', 'none'],
    ['placeholder is never chosen', YES_NO, 'Select', 'none'],
    ['punctuation only', WORDY_YEARS, '-', 'none'],
    ['number below every range', options('1-3 years', '3-5 years'), '0', 'none'],
    ['two numbers are not a single value', YEARS, '2 or 4', 'none'],
    ['no options at all', [], 'Yes', 'none'],
  ])('refuses to guess: %s', (_name, choices, wanted, expected) => {
    expect(picked(matchOption(choices, wanted))).toBe(expected)
  })

  it('reports duplicated labels as ambiguous', () => {
    const result = matchOption([option('Other', 'a'), option('Other', 'b')], 'Other')
    expect(result.kind).toBe('ambiguous')
  })

  it('skips disabled options', () => {
    const result = matchOption([option('Yes', 'y', { disabled: true }), option('No')], 'Yes')
    expect(result.kind).toBe('none')
  })

  it('prefers an exact value over a label containing it', () => {
    const result = matchOption([option('Remote only', 'remote'), option('Remote', 'r')], 'remote')
    expect(picked(result)).toBe('value:Remote only')
  })
})

describe('isPlaceholderOption', () => {
  it.each([
    ['Select…', '', true],
    ['-- Please select --', '', true],
    ['Choose one', 'choose', true],
    ['None', '', true],
    ['None', 'none', false],
    ['N/A', 'na', false],
    ['None of the above', 'none-of-the-above', false],
    ['Select', 'select-plan', false],
    ['Yes', 'yes', false],
  ])('%s (%s) → %s', (label, value, expected) => {
    expect(isPlaceholderOption(option(label, value))).toBe(expected)
  })
})

describe('parseRange', () => {
  it.each<[string, ReturnType<typeof parseRange>]>([
    ['2-5 years', { min: 2, max: 5, minExclusive: false, maxExclusive: false }],
    ['2 – 5', { min: 2, max: 5, minExclusive: false, maxExclusive: false }],
    ['10 to 20', { min: 10, max: 20, minExclusive: false, maxExclusive: false }],
    ['5+ years', { min: 5, max: Infinity, minExclusive: false, maxExclusive: false }],
    ['10 or more', { min: 10, max: Infinity, minExclusive: false, maxExclusive: false }],
    ['Less than 1 year', { min: 0, max: 1, minExclusive: false, maxExclusive: true }],
    ['Up to 3', { min: 0, max: 3, minExclusive: false, maxExclusive: false }],
    ['More than 10', { min: 10, max: Infinity, minExclusive: true, maxExclusive: false }],
    ['1,000-2,000', { min: 1000, max: 2000, minExclusive: false, maxExclusive: false }],
    ['Bachelor’s degree', null],
    ['2021', null],
  ])('%s', (label, expected) => {
    expect(parseRange(label)).toEqual(expected)
  })
})

describe('singleNumber', () => {
  it.each<[string, number | null]>([
    ['4', 4],
    ['4.5 years', 4.5],
    ['12 LPA', 12],
    ['30 days', 30],
    ['about 4', null],
    ['3 to 4', null],
    ['', null],
  ])('%s → %s', (value, expected) => {
    expect(singleNumber(value)).toBe(expected)
  })
})
