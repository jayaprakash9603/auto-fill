import { containsPhrase, normalizeValue, type FieldOption } from '@ufa/core'

export type OptionMatchMethod = 'value' | 'label' | 'yes-no' | 'range' | 'contains'

export type OptionMatch =
  | { kind: 'match'; option: FieldOption; score: number; method: OptionMatchMethod }
  | { kind: 'ambiguous'; options: FieldOption[] }
  | { kind: 'none' }

/** How sure an option match is; multiplied into the candidate's confidence. */
export const OPTION_SCORES: Readonly<Record<OptionMatchMethod, number>> = {
  value: 1,
  label: 1,
  'yes-no': 0.97,
  range: 0.95,
  contains: 0.85,
}

const PROMPT =
  /^(select|choose|pick|please select|please choose|select one|choose one|select an option|choose an option|select option|make a selection)$/
/** Real answers ("None", "N/A") unless the option has no value. */
const EMPTY_CHOICE = /^(|none|n a)$/

const YES = new Set([
  'yes',
  'y',
  'true',
  'i do',
  'i am',
  'i will',
  'i have',
  'agree',
  'yes i do',
  'yes i am',
])
const NO = new Set([
  'no',
  'n',
  'false',
  'i do not',
  'i dont',
  'i am not',
  'im not',
  'i will not',
  'no i do not',
  'no i am not',
])

/** "Select…", empty and disabled entries are never real answers. */
export function isPlaceholderOption(option: FieldOption): boolean {
  if (option.disabled) return true
  const label = normalizeValue(option.label)
  if (option.value === '') return PROMPT.test(label) || EMPTY_CHOICE.test(label)
  return PROMPT.test(label) && PROMPT.test(normalizeValue(option.value))
}

export function selectableOptions(options: readonly FieldOption[]): FieldOption[] {
  return options.filter((option) => !isPlaceholderOption(option))
}

function polarity(text: string): 'yes' | 'no' | null {
  if (YES.has(text)) return 'yes'
  if (NO.has(text)) return 'no'
  const [first] = text.split(' ')
  if (first === 'yes') return 'yes'
  if (first === 'no') return 'no'
  return null
}

export interface NumericRange {
  min: number
  max: number
  minExclusive: boolean
  maxExclusive: boolean
}

const NUM = String.raw`(\d+(?:\.\d+)?)`
const RANGE_PATTERNS: readonly [RegExp, (a: number, b: number) => NumericRange][] = [
  [
    new RegExp(`^${NUM}\\s*(?:-|to)\\s*${NUM}(?![\\d.])`),
    (a, b) => ({ min: a, max: b, minExclusive: false, maxExclusive: false }),
  ],
  [
    new RegExp(
      `^${NUM}\\s*(?:\\+|plus\\b|or more\\b|and above\\b|and more\\b|or above\\b|or over\\b)`,
    ),
    (a) => ({ min: a, max: Infinity, minExclusive: false, maxExclusive: false }),
  ],
  [
    new RegExp(`^(?:less than|under|below|fewer than)\\s+${NUM}`),
    (a) => ({ min: 0, max: a, minExclusive: false, maxExclusive: true }),
  ],
  [
    new RegExp(`^up to\\s+${NUM}`),
    (a) => ({ min: 0, max: a, minExclusive: false, maxExclusive: false }),
  ],
  [
    new RegExp(`^(?:more than|over|above|greater than)\\s+${NUM}`),
    (a) => ({ min: a, max: Infinity, minExclusive: true, maxExclusive: false }),
  ],
]

/** Parses option labels like "2-5 years", "5+", "Less than 1" or "10 or more" into a range. */
export function parseRange(label: string): NumericRange | null {
  const text = label
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  for (const [pattern, build] of RANGE_PATTERNS) {
    const match = pattern.exec(text)
    if (match) return build(Number(match[1]), Number(match[2]))
  }
  return null
}

function inRange(value: number, range: NumericRange, halfOpen: boolean): boolean {
  const aboveMin = range.minExclusive ? value > range.min : value >= range.min
  const belowMax =
    range.maxExclusive || (halfOpen && range.max !== Infinity)
      ? value < range.max
      : value <= range.max
  return aboveMin && belowMax
}

/** The single number in a value like "4", "4 years" or "4.5", or null. */
export function singleNumber(text: string): number | null {
  const numbers = text.match(/\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length !== 1) return null
  const rest = normalizeValue(text.replace(numbers[0]!, ' '))
  if (
    rest &&
    !/^(years?|yrs?|months?|weeks?|days?|lpa|k|usd|inr|eur|gbp)( of experience)?$/.test(rest)
  )
    return null
  return Number(numbers[0])
}

function unique(options: FieldOption[], method: OptionMatchMethod): OptionMatch | null {
  if (options.length === 1)
    return { kind: 'match', option: options[0]!, score: OPTION_SCORES[method], method }
  if (options.length > 1) return { kind: 'ambiguous', options }
  return null
}

/**
 * Finds the option a saved text answer stands for. Only real options count; when two fit equally
 * the result is ambiguous and nothing is chosen.
 */
export function matchOption(options: readonly FieldOption[], wanted: string): OptionMatch {
  const choices = selectableOptions(options)
  const raw = wanted.trim()
  if (!raw || choices.length === 0) return { kind: 'none' }
  const normalized = normalizeValue(raw)

  const byValue = choices.filter((option) => option.value === raw)
  const exactValue = unique(byValue, 'value')
  if (exactValue) return exactValue

  const byLabel = choices.filter(
    (option) =>
      normalizeValue(option.label) === normalized || normalizeValue(option.value) === normalized,
  )
  const exactLabel = unique(byLabel, 'label')
  if (exactLabel) return exactLabel

  const wantedPolarity = polarity(normalized)
  if (wantedPolarity) {
    const sameSide = choices.filter(
      (option) => polarity(normalizeValue(option.label)) === wantedPolarity,
    )
    const yesNo = unique(sameSide, 'yes-no')
    if (yesNo) return yesNo
  }

  const number = singleNumber(raw)
  if (number !== null) {
    const ranged = choices.flatMap((option) => {
      const range = parseRange(option.label)
      return range ? [{ option, range }] : []
    })
    // Inclusive first; ranges that share a boundary ("1-3", "3-5") are then read as half-open.
    let containing = ranged.filter((entry) => inRange(number, entry.range, false))
    if (containing.length > 1)
      containing = ranged.filter((entry) => inRange(number, entry.range, true))
    const range = unique(
      containing.map((entry) => entry.option),
      'range',
    )
    if (range) return range
  }

  if (normalized.length >= 2) {
    const overlapping = choices.filter((option) => {
      const label = normalizeValue(option.label)
      return (
        label.length >= 2 &&
        (containsPhrase(label, normalized) || containsPhrase(normalized, label))
      )
    })
    const contained = unique(overlapping, 'contains')
    if (contained) return contained
  }
  return { kind: 'none' }
}
