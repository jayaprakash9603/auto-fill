import { humanizeIdentifier, type LabelSource } from '@ufa/core'

import { attr, containsControl, idRefs, isElement, labelsOf, legendOf } from './dom'
import {
  MAX_TEXT_LENGTH,
  cleanLabel,
  collapseWhitespace,
  hasRequiredMarker,
  isExamplePlaceholder,
  textOf,
} from './text'

export interface ResolvedLabel {
  text: string
  source: LabelSource
  /** The label text carried a required marker such as "*" or "(required)". */
  required: boolean
}

export interface ResolvedGroupLabel extends ResolvedLabel {
  /** A fieldset legend that was displaced by a more specific question and is section context. */
  sectionHint: string | null
  /** The legend or group container that supplied the label, so it is not reused as a section. */
  labelElement: Element | null
}

const NONE: ResolvedLabel = { text: '', source: 'none', required: false }

/** Ancestors that bound the adjacent-text search: text beyond them belongs to other content. */
const SEARCH_BOUNDARIES = new Set(['form', 'body', 'html', 'fieldset', 'table', 'ul', 'ol', 'dl'])

const GENERIC_IDENTIFIER_TOKENS = new Set([
  'base',
  'control',
  'downshift',
  'element',
  'field',
  'form',
  'id',
  'input',
  'item',
  'mui',
  'react',
  'select',
  'text',
  'value',
])

function candidate(raw: string, source: LabelSource, markerSource?: Element): ResolvedLabel | null {
  const cleaned = cleanLabel(raw)
  if (!cleaned.text) return null
  return {
    text: cleaned.text,
    source,
    required: cleaned.required || (!!markerSource && hasRequiredMarker(markerSource)),
  }
}

function fromLabelElements(element: Element): ResolvedLabel | null {
  for (const label of labelsOf(element)) {
    const found = candidate(
      textOf(label),
      label.contains(element) ? 'label-wrap' : 'label-for',
      label,
    )
    if (found) return found
  }
  return null
}

function fromAria(element: Element, source?: LabelSource): ResolvedLabel | null {
  const references = idRefs(element, 'aria-labelledby').filter((entry) => entry !== element)
  if (references.length > 0) {
    const text = references.map((entry) => textOf(entry, { includeHidden: true })).join(' ')
    const found = candidate(text, source ?? 'aria-labelledby', references[references.length - 1])
    if (found) return found
  }
  const ariaLabel = attr(element, 'aria-label')
  return ariaLabel ? candidate(ariaLabel, source ?? 'aria-label') : null
}

function fromPlaceholder(element: Element): ResolvedLabel | null {
  const placeholder =
    attr(element, 'placeholder') ??
    attr(element, 'aria-placeholder') ??
    attr(element, 'data-placeholder')
  if (!placeholder || isExamplePlaceholder(placeholder)) return null
  return candidate(placeholder, 'placeholder')
}

/** Text immediately before `start`, climbing a few ancestors but never past a boundary. */
function previousText(start: Element, boundary: Element | null, maxDepth = 3): string | null {
  let node: Element = start
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    let sibling = node.previousSibling
    while (sibling) {
      if (sibling.nodeType === 3) {
        const text = collapseWhitespace(sibling.nodeValue ?? '')
        if (text) return text
      } else if (isElement(sibling) && sibling.localName !== 'legend') {
        if (containsControl(sibling)) return null
        const text = textOf(sibling)
        if (text) return text
      }
      sibling = sibling.previousSibling
    }
    const parent = node.parentElement
    if (!parent || parent === boundary || SEARCH_BOUNDARIES.has(parent.localName)) return null
    node = parent
  }
  return null
}

function tableCellText(element: Element): string | null {
  const cell = element.closest('td, th')
  if (!cell) return null
  for (
    let sibling = cell.previousElementSibling;
    sibling;
    sibling = sibling.previousElementSibling
  ) {
    if (containsControl(sibling)) break
    const text = textOf(sibling)
    if (text) return text
  }
  const row = cell.parentElement
  const table = cell.closest('table')
  if (!row || !table) return null
  const headerRow = table.querySelector('thead tr') ?? table.querySelector('tr')
  if (!headerRow || headerRow === row) return null
  const header = headerRow.children[Array.from(row.children).indexOf(cell)]
  return header && !containsControl(header) ? textOf(header) || null : null
}

function definitionTermText(element: Element): string | null {
  const term = element.closest('dd')?.previousElementSibling
  return term?.localName === 'dt' ? textOf(term) || null : null
}

function fromAdjacentText(element: Element): ResolvedLabel | null {
  const cell = element.closest('td, th')
  const text = previousText(element, cell) ?? tableCellText(element) ?? definitionTermText(element)
  return text ? candidate(text, 'adjacent-text') : null
}

/** Humanized `name`/`id`, ignoring generated identifiers such as "input-1234" or ":r5:". */
export function meaningfulIdentifier(raw: string | null): string | null {
  const words = humanizeIdentifier(raw)
    .split(' ')
    .filter((word) => word && !GENERIC_IDENTIFIER_TOKENS.has(word))
    .filter((word) => !/\d/.test(word) && word.length > 1)
  return words.length > 0 ? words.join(' ') : null
}

function fromIdentifier(element: Element): ResolvedLabel | null {
  const text =
    meaningfulIdentifier(attr(element, 'name')) ?? meaningfulIdentifier(attr(element, 'id'))
  return text ? { text, source: 'name', required: false } : null
}

export interface ControlLabelContext {
  /** Legend of the enclosing fieldset when this control is the only control inside it. */
  soleFieldsetLegend: Element | null
}

/**
 * Resolves the label of a single control. Explicit associations win over ARIA naming, then the
 * legend of a single-control fieldset, then attributes, and text heuristics come last.
 */
export function resolveControlLabel(element: Element, context: ControlLabelContext): ResolvedLabel {
  const legend = context.soleFieldsetLegend
  return (
    fromLabelElements(element) ??
    fromAria(element) ??
    (legend ? candidate(textOf(legend), 'legend', legend) : null) ??
    (attr(element, 'title') ? candidate(attr(element, 'title')!, 'title') : null) ??
    fromPlaceholder(element) ??
    fromAdjacentText(element) ??
    fromIdentifier(element) ??
    NONE
  )
}

function commonFieldset(members: readonly Element[]): Element | null {
  let fieldset = members[0]?.parentElement?.closest('fieldset') ?? null
  while (fieldset && !members.every((member) => fieldset!.contains(member))) {
    fieldset = fieldset.parentElement?.closest('fieldset') ?? null
  }
  return fieldset
}

function commonGroup(container: Element, members: readonly Element[]): Element | null {
  const selector = '[role="radiogroup"], [role="group"]'
  let group = container.matches(selector) ? container : container.parentElement?.closest(selector)
  while (group && !members.every((member) => group!.contains(member))) {
    group = group.parentElement?.closest(selector)
  }
  return group ?? null
}

/** The member's own block: its wrapping label when it has one, so option text is skipped. */
function memberBlock(member: Element): Element {
  return labelsOf(member).find((label) => label.contains(member)) ?? member
}

/**
 * Resolves the question of a radio or checkbox group. Member labels are option labels, so the
 * group's own ARIA name wins, then a question written just before the first option, then the
 * fieldset legend, then the shared `name`.
 */
export function resolveGroupLabel(
  container: Element,
  members: readonly Element[],
): ResolvedGroupLabel {
  const first = members[0]
  const none = { ...NONE, sectionHint: null, labelElement: null }
  if (!first) return none
  const group = commonGroup(container, members)
  const aria = group ? fromAria(group, 'group-aria') : null
  if (aria) return { ...aria, sectionHint: null, labelElement: group }

  const fieldset = commonFieldset(members)
  const legend = fieldset ? legendOf(fieldset) : null
  const legendLabel = legend ? candidate(textOf(legend), 'legend', legend) : null
  const questionText = previousText(memberBlock(first), fieldset, 4)
  const question = questionText ? candidate(questionText, 'adjacent-text') : null
  if (question) {
    return { ...question, sectionHint: legendLabel?.text ?? null, labelElement: legend }
  }
  if (legendLabel) return { ...legendLabel, sectionHint: null, labelElement: legend }

  const identifier = fromIdentifier(first)
  return identifier ? { ...identifier, sectionHint: null, labelElement: null } : none
}

/** Visible label of one option of a radio/checkbox group or ARIA widget. */
export function resolveOptionLabel(member: Element): string {
  for (const label of labelsOf(member)) {
    const text = cleanLabel(textOf(label)).text
    if (text) return text
  }
  const aria = fromAria(member)
  if (aria) return aria.text
  if (member.getAttribute('role')) {
    const own = cleanLabel(textOf(member)).text
    if (own) return own
  }
  for (let sibling = member.nextSibling; sibling; sibling = sibling.nextSibling) {
    if (isElement(sibling) && containsControl(sibling)) break
    const text = sibling.nodeType === 3 ? collapseWhitespace(sibling.nodeValue ?? '') : ''
    const elementText = isElement(sibling) ? textOf(sibling) : ''
    if (text || elementText) return cleanLabel(text || elementText).text
  }
  return attr(member, 'value') ?? ''
}

/** Text referenced by `aria-describedby`, used as help text. */
export function resolveDescription(element: Element): string | null {
  const text = idRefs(element, 'aria-describedby')
    .map((entry) => textOf(entry, { includeHidden: true }))
    .join(' ')
    .trim()
  return text ? text.slice(0, MAX_TEXT_LENGTH) : null
}
