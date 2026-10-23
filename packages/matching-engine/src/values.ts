import {
  normalizeValue,
  type AnswerValue,
  type FieldDescriptor,
  type FieldType,
  type FieldValue,
} from '@ufa/core'

import { matchOption, selectableOptions, singleNumber, type OptionMatch } from './options'

export type Conversion =
  | { ok: true; value: FieldValue; score: number; note: string | null }
  | { ok: false; reason: string; ambiguous: boolean }

const UNSUPPORTED_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'file',
  'password',
  'range',
  'color',
  'unknown',
])
const MULTILINE_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(['textarea', 'contenteditable'])
const FORMATTED_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'email',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
])

/** A combobox whose loaded options do not include the answer may reject typed text. */
const COMBOBOX_FREE_TEXT = 0.9

const fail = (reason: string, ambiguous = false): Conversion => ({ ok: false, reason, ambiguous })
const ok = (value: FieldValue, score = 1, note: string | null = null): Conversion => ({
  ok: true,
  value,
  score,
  note,
})
const quote = (text: string) => `"${text.length > 40 ? `${text.slice(0, 37)}…` : text}"`

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_CHARS = /^[0-9+().\-\s/x]+$|^[0-9+().\-\s/]+\s*(ext\.?|extension)\s*\d+$/i

function polarity(text: string): boolean | null {
  const normalized = normalizeValue(text)
  if (/^(yes|y|true|1|checked|on)$/.test(normalized)) return true
  if (/^(no|n|false|0|unchecked|off)$/.test(normalized)) return false
  return null
}

function validDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/** Checks and, where unambiguous, adapts text to an input type's required format. */
export function formatForType(type: FieldType, text: string): Conversion {
  const trimmed = text.trim()
  switch (type) {
    case 'email':
      return EMAIL.test(trimmed)
        ? ok({ kind: 'text', text: trimmed })
        : fail('Not an email address.')
    case 'tel': {
      const digits = trimmed.replace(/\D/g, '')
      return digits.length >= 5 && PHONE_CHARS.test(trimmed)
        ? ok({ kind: 'text', text: trimmed })
        : fail('Not a phone number.')
    }
    case 'url': {
      const parse = (candidate: string) => {
        try {
          const url = new URL(candidate)
          return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
        } catch {
          return null
        }
      }
      if (parse(trimmed)) return ok({ kind: 'text', text: trimmed })
      if (
        !/\s/.test(trimmed) &&
        /^[^/:]+\.[a-z]{2,}(\/|$)/i.test(trimmed) &&
        parse(`https://${trimmed}`)
      )
        return ok({ kind: 'text', text: `https://${trimmed}` }, 1, 'Added https://')
      return fail('Not a web address.')
    }
    case 'number': {
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) return ok({ kind: 'text', text: trimmed })
      const number = singleNumber(trimmed)
      return number === null
        ? fail('Not a number.')
        : ok({ kind: 'text', text: String(number) }, 1, `Using ${number}`)
    }
    case 'date': {
      const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(trimmed)
      if (match && validDate(Number(match[1]), Number(match[2]), Number(match[3])))
        return ok({ kind: 'text', text: `${match[1]}-${match[2]}-${match[3]}` })
      return fail('Dates must be saved as YYYY-MM-DD.')
    }
    case 'month': {
      const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(trimmed)
      if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12)
        return ok({ kind: 'text', text: `${match[1]}-${match[2]}` })
      return fail('Months must be saved as YYYY-MM.')
    }
    case 'week':
      return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(trimmed)
        ? ok({ kind: 'text', text: trimmed })
        : fail('Weeks must be saved as YYYY-Www.')
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(trimmed)
        ? ok({ kind: 'text', text: trimmed })
        : fail('Times must be saved as HH:MM.')
    case 'datetime-local':
      return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(trimmed)
        ? ok({ kind: 'text', text: trimmed })
        : fail('Dates with times must be saved as YYYY-MM-DDTHH:MM.')
    default:
      return ok({ kind: 'text', text })
  }
}

function optionNote(match: Extract<OptionMatch, { kind: 'match' }>): string | null {
  switch (match.method) {
    case 'value':
    case 'label':
      return null
    case 'yes-no':
      return `Option ${quote(match.option.label)} means the same yes/no`
    case 'range':
      return `Option ${quote(match.option.label)} contains the number`
    case 'contains':
      return `Option ${quote(match.option.label)} overlaps the answer`
  }
}

function chooseOne(field: FieldDescriptor, wanted: string): Conversion {
  if (selectableOptions(field.options).length === 0)
    return fail('The field has no options to choose from yet.')
  const match = matchOption(field.options, wanted)
  if (match.kind === 'match')
    return ok({ kind: 'options', values: [match.option.value] }, match.score, optionNote(match))
  if (match.kind === 'ambiguous')
    return fail(
      `${quote(wanted)} fits several options: ${match.options.map((option) => quote(option.label)).join(', ')}.`,
      true,
    )
  return fail(`${quote(wanted)} is not one of the options.`)
}

function chooseMany(field: FieldDescriptor, items: readonly string[]): Conversion {
  if (selectableOptions(field.options).length === 0)
    return fail('The field has no options to choose from yet.')
  const values: string[] = []
  let score = 1
  const notes: string[] = []
  for (const item of items) {
    const result = chooseOne(field, item)
    if (!result.ok) return result
    if (result.value.kind !== 'options') continue
    for (const value of result.value.values) if (!values.includes(value)) values.push(value)
    score = Math.min(score, result.score)
    if (result.note) notes.push(result.note)
  }
  if (values.length === 0) return fail('The saved list is empty.')
  return ok({ kind: 'options', values }, score, notes.length ? notes.join('; ') : null)
}

const textOf = (value: AnswerValue, multiline: boolean): string => {
  switch (value.kind) {
    case 'text':
      return value.text
    case 'boolean':
      return value.value ? 'Yes' : 'No'
    case 'list':
      return value.items.join(multiline ? '\n' : ', ')
  }
}

/**
 * Expresses a saved answer as a value for one specific control, or explains why it cannot be.
 * The score (0..1) says how direct the conversion was: 1 for exact, lower for inferred options.
 */
export function toFieldValue(answer: AnswerValue, field: FieldDescriptor): Conversion {
  if (UNSUPPORTED_TYPES.has(field.type)) return fail('This kind of control is not supported.')
  switch (field.type) {
    case 'checkbox': {
      if (answer.kind === 'boolean') return ok({ kind: 'checked', checked: answer.value })
      if (answer.kind === 'text') {
        const checked = polarity(answer.text)
        if (checked !== null) return ok({ kind: 'checked', checked })
      }
      return fail('A checkbox needs a yes or no answer.')
    }
    case 'select':
    case 'radio-group': {
      if (answer.kind === 'boolean') return chooseOne(field, answer.value ? 'Yes' : 'No')
      if (answer.kind === 'list') {
        if (answer.items.length !== 1) return fail('Only one option can be chosen here.')
        return chooseOne(field, answer.items[0]!)
      }
      return chooseOne(field, answer.text)
    }
    case 'multiselect':
    case 'checkbox-group': {
      if (answer.kind === 'boolean') return fail('Choose options here, not yes or no.')
      if (answer.kind === 'list') return chooseMany(field, answer.items)
      const parts = answer.text
        .split(/[,;\n]/)
        .map((part) => part.trim())
        .filter(Boolean)
      if (parts.length <= 1) return chooseOne(field, answer.text)
      const many = chooseMany(field, parts)
      if (many.ok) return many
      // One option may itself contain a comma ("Yes, full time").
      const whole = chooseOne(field, answer.text)
      return whole.ok ? whole : many
    }
    case 'combobox': {
      const text = textOf(answer, false)
      if (!text.trim()) return fail('The saved answer is empty.')
      if (selectableOptions(field.options).length > 0) {
        const match = matchOption(field.options, text)
        if (match.kind === 'match')
          return ok({ kind: 'text', text: match.option.label }, match.score, optionNote(match))
        if (match.kind === 'ambiguous')
          return fail(
            `${quote(text)} fits several options: ${match.options.map((option) => quote(option.label)).join(', ')}.`,
            true,
          )
        return ok(
          { kind: 'text', text },
          COMBOBOX_FREE_TEXT,
          'Not among the listed options; typed as text',
        )
      }
      return ok({ kind: 'text', text })
    }
    default: {
      if (answer.kind === 'boolean' && FORMATTED_TYPES.has(field.type))
        return fail('A yes or no answer does not fit this field.')
      const text = textOf(answer, MULTILINE_TYPES.has(field.type))
      if (!text.trim()) return fail('The saved answer is empty.')
      const formatted = formatForType(field.type, text)
      if (!formatted.ok || formatted.value.kind !== 'text') return formatted
      const length = formatted.value.text.length
      if (field.maxLength !== null && field.maxLength > 0 && length > field.maxLength)
        return fail(`Longer than the ${field.maxLength} characters this field allows.`)
      return formatted
    }
  }
}
