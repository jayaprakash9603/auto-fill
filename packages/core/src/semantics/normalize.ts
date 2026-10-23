const FILLER_PREFIXES = [
  'please enter your',
  'please enter',
  'please provide your',
  'please provide',
  'please select your',
  'please select',
  'please specify your',
  'please specify',
  'please choose your',
  'please choose',
  'please type your',
  'enter your',
  'enter',
  'type your',
  'select your',
  'select',
  'choose your',
  'choose',
  'provide your',
  'specify your',
  'what is your',
  'whats your',
  'what is the',
  'your',
]

const NOISE_WORDS = new Set([
  'candidate',
  'candidates',
  'applicant',
  'applicants',
  'the',
  'a',
  'an',
  'please',
  'here',
  'below',
  'kindly',
])

const SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\be mail\b/g, 'email'],
  [/\bemail id\b/g, 'email'],
  [/\b(mobile|cell|cellphone|telephone|phone) (phone )?(number|no)\b/g, 'phone'],
  [/\b(mobile|cell|cellphone|telephone)\b/g, 'phone'],
  [/\bcontact number\b/g, 'phone'],
  [/\b(zip|zipcode|postcode|pincode)( code)?\b/g, 'postal code'],
  [/\bpin code\b/g, 'postal code'],
  [/\b(surname|family name)\b/g, 'last name'],
  [/\b(given name|forename)\b/g, 'first name'],
  [/\borganisation\b/g, 'organization'],
  [/\b(yrs|yr)\b/g, 'years'],
]

const REQUIRED_MARKERS = /\(\s*(required|optional|mandatory)\s*\)/g
const TRAILING_FLAGS = /\s+(required|optional|mandatory)$/

function stripPrefixes(text: string): string {
  let current = text
  let changed = true
  while (changed) {
    changed = false
    for (const prefix of FILLER_PREFIXES) {
      if (current === prefix) continue
      if (current.startsWith(`${prefix} `)) {
        current = current.slice(prefix.length + 1)
        changed = true
        break
      }
    }
  }
  return current
}

/**
 * Normalizes a field label into a canonical form used for matching.
 * "First name *", "Candidate First Name" and "Enter your first name" all become "first name".
 */
export function normalizeLabel(raw: string | null | undefined): string {
  if (!raw) return ''
  let text = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(REQUIRED_MARKERS, ' ')
    .replace(/\*/g, ' ')
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  text = text.replace(TRAILING_FLAGS, '').trim()
  text = stripPrefixes(text)

  const tokens = text.split(' ').filter(Boolean)
  const meaningful = tokens.filter((token) => !NOISE_WORDS.has(token))
  text = (meaningful.length > 0 ? meaningful : tokens).join(' ')

  for (const [pattern, replacement] of SYNONYMS) {
    text = text.replace(pattern, replacement)
  }
  return text
    .replace(/\s+/g, ' ')
    .replace(/\b(\w+(?: \w+)+) \1\b/g, '$1')
    .trim()
}

/** Splits identifiers such as `firstName`, `first_name` or `applicant[first-name]` into words. */
export function humanizeIdentifier(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

export function tokenize(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean)
}

/** Normalizes free text values (option labels, answers) for comparison without label-specific rules. */
export function normalizeValue(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
}
