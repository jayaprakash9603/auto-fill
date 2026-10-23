import { isElement } from './dom'

/** Upper bound for any single piece of label or context text. */
export const MAX_TEXT_LENGTH = 300

const NON_TEXT_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg'])

/** Nested controls whose text would otherwise leak into a surrounding label. */
const CONTROL_TAGS = new Set(['select', 'textarea', 'input', 'button', 'option', 'datalist'])

const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'em',
  'i',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
])

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function isHiddenFromText(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return true
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  return !!style && (style.display === 'none' || style.visibility === 'hidden')
}

export interface TextOptions {
  /** Include text inside hidden elements; accessible-name references count even when hidden. */
  includeHidden?: boolean
}

/**
 * Human-readable text of a node: skips scripts, nested controls (so a wrapping label does not
 * absorb a select's options) and elements hidden from users, and inserts spaces between blocks.
 */
export function textOf(node: Node, options: TextOptions = {}): string {
  const parts: string[] = []
  let length = 0
  const walk = (current: Node, isRoot: boolean) => {
    if (length > MAX_TEXT_LENGTH * 2) return
    if (current.nodeType === 3) {
      const value = current.nodeValue ?? ''
      parts.push(value)
      length += value.length
      return
    }
    if (!isElement(current) || NON_TEXT_TAGS.has(current.localName)) return
    if (!isRoot && CONTROL_TAGS.has(current.localName)) return
    if (!options.includeHidden && isHiddenFromText(current)) return
    const block = !INLINE_TAGS.has(current.localName)
    if (block) parts.push(' ')
    for (const child of current.childNodes) walk(child, false)
    if (block) parts.push(' ')
  }
  walk(node, true)
  const text = collapseWhitespace(parts.join(''))
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text
}

export interface CleanLabel {
  text: string
  /** The label carried a required marker such as "*" or "(required)". */
  required: boolean
}

const LEADING_STARS = /^\*+\s*/
const TRAILING_STARS = /\s*\*+$/
const REQUIRED_FLAG = /\s*\(\s*(required|mandatory)\s*\)$/i
const OPTIONAL_FLAG = /\s*\(\s*optional\s*\)$/i
const TRAILING_PUNCTUATION = /\s*[:：]$/

/** Strips required markers and trailing colons from label text, remembering whether it was required. */
export function cleanLabel(raw: string): CleanLabel {
  let text = collapseWhitespace(raw)
  let required = false
  let previous = ''
  while (previous !== text) {
    previous = text
    const withoutStars = text.replace(LEADING_STARS, '').replace(TRAILING_STARS, '')
    const withoutFlag = withoutStars.replace(REQUIRED_FLAG, '')
    if (withoutStars !== text || withoutFlag !== withoutStars) required = true
    text = withoutFlag.replace(OPTIONAL_FLAG, '').replace(TRAILING_PUNCTUATION, '').trim()
  }
  return { text, required }
}

/** True when the raw text of an element ends (or starts) with an asterisk, even inside aria-hidden. */
export function hasRequiredMarker(element: Element): boolean {
  const raw = collapseWhitespace(element.textContent ?? '')
  return /\*$/.test(raw) || /^\*/.test(raw)
}

const EXAMPLE_PLACEHOLDER =
  /^(e\.?g\.?|ex(ample)?\s*[:.]|i\.e\.|like\s)|@|^https?:|^[\d\s()+.-]{5,}$/

/** Placeholders such as "e.g. Acme" or "jane@example.com" are examples, not labels. */
export function isExamplePlaceholder(text: string): boolean {
  return EXAMPLE_PLACEHOLDER.test(text.trim())
}
