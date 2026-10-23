import type { AnswerValue, FieldDescriptor, FieldValue } from '@ufa/core'
import { describe, expect, it } from 'vitest'

import { field, list, no, option, options, text, yes } from './test-utils/fixtures'
import { formatForType, toFieldValue } from './values'

const outcome = (answer: AnswerValue, overrides: Partial<FieldDescriptor>) => {
  const result = toFieldValue(answer, field(overrides))
  return result.ok
    ? { value: result.value, score: result.score, note: result.note }
    : { reason: result.reason, ambiguous: result.ambiguous }
}

const asText = (value: string): FieldValue => ({ kind: 'text', text: value })
const chosen = (...values: string[]): FieldValue => ({ kind: 'options', values })

describe('formatForType', () => {
  it.each<[Parameters<typeof formatForType>[0], string, string | null]>([
    ['email', ' person@example.com ', 'person@example.com'],
    ['email', 'person at example', null],
    ['tel', '+1 (555) 010-0000', '+1 (555) 010-0000'],
    ['tel', '555', null],
    ['tel', 'call me', null],
    ['url', 'https://example.com/me', 'https://example.com/me'],
    ['url', 'example.com/me', 'https://example.com/me'],
    ['url', 'javascript:alert(1)', null],
    ['url', 'my site', null],
    ['number', '42', '42'],
    ['number', '-3.5', '-3.5'],
    ['number', '5 years', '5'],
    ['number', 'five', null],
    ['date', '2024-05-01', '2024-05-01'],
    ['date', '2024/05/01', '2024-05-01'],
    ['date', '2024-02-30', null],
    ['date', '01/05/2024', null],
    ['month', '2024-05', '2024-05'],
    ['month', '2024-05-17', '2024-05'],
    ['month', '2024-13', null],
    ['week', '2024-W09', '2024-W09'],
    ['week', '2024-W60', null],
    ['time', '09:30', '09:30'],
    ['time', '24:00', null],
    ['datetime-local', '2024-05-01T09:30', '2024-05-01T09:30'],
    ['datetime-local', '2024-05-01 09:30', null],
    ['text', ' kept as is ', ' kept as is '],
  ])('%s %j', (type, input, expected) => {
    const result = formatForType(type, input)
    expect(result.ok ? (result.value as { text: string }).text : null).toBe(expected)
  })

  it('explains adapted values', () => {
    expect(formatForType('url', 'example.com')).toMatchObject({ ok: true, note: 'Added https://' })
    expect(formatForType('number', '5 years')).toMatchObject({ ok: true, note: 'Using 5' })
  })
})

describe('toFieldValue', () => {
  const yesNo = { type: 'radio-group' as const, options: options('Yes', 'No') }
  const languages = {
    type: 'checkbox-group' as const,
    options: options('TypeScript', 'Go', 'Rust'),
  }

  it.each<[string, AnswerValue, Partial<FieldDescriptor>, FieldValue]>([
    ['text into text', text('Ada'), { type: 'text' }, asText('Ada')],
    ['list into textarea, one per line', list('A', 'B'), { type: 'textarea' }, asText('A\nB')],
    ['list into text, comma separated', list('A', 'B'), { type: 'text' }, asText('A, B')],
    ['boolean into a plain text field', yes, { type: 'text' }, asText('Yes')],
    ['boolean into checkbox', yes, { type: 'checkbox' }, { kind: 'checked', checked: true }],
    ['"No" into checkbox', text('No'), { type: 'checkbox' }, { kind: 'checked', checked: false }],
    ['boolean into a yes/no radio', no, yesNo, chosen('No')],
    [
      'text into select by label',
      text('Go'),
      { type: 'select', options: options('Go', 'Rust') },
      chosen('Go'),
    ],
    [
      'single-item list into select',
      list('Rust'),
      { type: 'select', options: options('Go', 'Rust') },
      chosen('Rust'),
    ],
    ['list into checkbox group', list('TypeScript', 'Go'), languages, chosen('TypeScript', 'Go')],
    ['comma text into checkbox group', text('Rust; Go'), languages, chosen('Rust', 'Go')],
    ['duplicates collapse', list('Go', 'go'), languages, chosen('Go')],
    [
      'combobox picks the option label',
      text('india'),
      { type: 'combobox', options: [option('India', 'IN')] },
      asText('India'),
    ],
    ['combobox without options takes text', text('Pune'), { type: 'combobox' }, asText('Pune')],
  ])('%s', (_name, answer, overrides, expected) => {
    expect(outcome(answer, overrides)).toMatchObject({ value: expected })
  })

  it.each<[string, AnswerValue, Partial<FieldDescriptor>, string]>([
    ['file inputs', text('cv.pdf'), { type: 'file' }, 'not supported'],
    ['password inputs', text('x'), { type: 'password' }, 'not supported'],
    ['checkbox with free text', text('maybe'), { type: 'checkbox' }, 'yes or no'],
    ['select without options', text('Go'), { type: 'select' }, 'no options'],
    [
      'select with an unknown answer',
      text('Haskell'),
      { type: 'select', options: options('Go') },
      'not one of the options',
    ],
    [
      'several items into a single choice',
      list('Go', 'Rust'),
      { type: 'select', options: options('Go', 'Rust') },
      'Only one option',
    ],
    ['boolean into options', yes, languages, 'not yes or no'],
    ['unknown list item', list('Go', 'Haskell'), languages, '"Haskell" is not one of the options'],
    ['boolean into email', yes, { type: 'email' }, 'does not fit'],
    ['bad email', text('nope'), { type: 'email' }, 'Not an email address'],
    ['empty text', text('   '), { type: 'text' }, 'empty'],
    ['too long', text('abcdef'), { type: 'text', maxLength: 5 }, '5 characters'],
  ])('rejects %s', (_name, answer, overrides, reason) => {
    expect(outcome(answer, overrides)).toMatchObject({ reason: expect.stringContaining(reason) })
  })

  it('reports ambiguous option matches separately from mismatches', () => {
    const countries = {
      type: 'select' as const,
      options: options('United States', 'United Kingdom'),
    }
    expect(outcome(text('United'), countries)).toMatchObject({ ambiguous: true })
    expect(outcome(text('France'), countries)).toMatchObject({ ambiguous: false })
  })

  it('scores inferred options below exact ones and explains them', () => {
    const years = { type: 'select' as const, options: options('0-2 years', '3-5 years') }
    expect(outcome(text('4'), years)).toEqual({
      value: chosen('3-5 years'),
      score: 0.95,
      note: 'Option "3-5 years" contains the number',
    })
    expect(outcome(text('3-5 years'), years)).toEqual({
      value: chosen('3-5 years'),
      score: 1,
      note: null,
    })
  })

  it('types free text into a combobox whose options do not include it, with lower confidence', () => {
    expect(
      outcome(text('Pune'), { type: 'combobox', options: options('Delhi', 'Mumbai') }),
    ).toEqual({
      value: asText('Pune'),
      score: 0.9,
      note: 'Not among the listed options; typed as text',
    })
  })

  it('never fills a placeholder option', () => {
    const select = { type: 'select' as const, options: [option('Select…', ''), option('Go')] }
    expect(outcome(text('Select'), select)).toMatchObject({
      reason: expect.stringContaining('not one of'),
    })
  })

  it('counts maxLength after formatting', () => {
    expect(outcome(text('example.com'), { type: 'url', maxLength: 12 })).toMatchObject({
      reason: expect.stringContaining('12 characters'),
    })
  })
})
