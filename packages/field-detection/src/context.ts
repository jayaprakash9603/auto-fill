import { attr, closestAcrossShadow, idRefs, legendOf, parentAcrossShadow } from './dom'
import { cleanLabel, textOf } from './text'
import { headingBefore, positionOf, type TreeIndex } from './tree'

const NAMED_REGION = [
  'section[aria-label]',
  'section[aria-labelledby]',
  '[role="region"][aria-label]',
  '[role="region"][aria-labelledby]',
  '[role="group"][aria-label]',
  '[role="group"][aria-labelledby]',
].join(',')

function accessibleName(element: Element): string | null {
  const references = idRefs(element, 'aria-labelledby')
  const raw = references.length
    ? references.map((entry) => textOf(entry, { includeHidden: true })).join(' ')
    : attr(element, 'aria-label')
  const text = raw ? cleanLabel(raw).text : ''
  return text || null
}

function headingText(heading: Element | null): string | null {
  return heading ? cleanLabel(textOf(heading, { includeHidden: true })).text || null : null
}

export interface SectionInput {
  /** Element whose position anchors the field: the control, or the first member of a group. */
  anchor: Element
  /** The label came from this element (a legend or group container), so it is not a section. */
  labelElement: Element | null
  /** Legend displaced by a more specific group question. */
  sectionHint: string | null
}

/** Computes section and form-title context for fields, caching per form. */
export function createContextResolver(index: TreeIndex) {
  const formTitles = new Map<Element, string | null>()

  const formOf = (element: Element) => closestAcrossShadow(element, 'form, [role="form"]')

  const formTitle = (anchor: Element): string | null => {
    const form = formOf(anchor)
    if (!form) return null
    if (formTitles.has(form)) return formTitles.get(form) ?? null
    const title = accessibleName(form) ?? headingText(headingBefore(index, positionOf(index, form)))
    formTitles.set(form, title)
    return title
  }

  const section = ({ anchor, labelElement, sectionHint }: SectionInput): string | null => {
    if (sectionHint) return sectionHint
    for (let fieldset = closestAcrossShadow(anchor, 'fieldset'); fieldset;) {
      const legend = legendOf(fieldset)
      if (legend && legend !== labelElement) {
        const text = cleanLabel(textOf(legend)).text
        if (text) return text
      }
      const parent = parentAcrossShadow(fieldset)
      fieldset = parent ? closestAcrossShadow(parent, 'fieldset') : null
    }
    for (let region = closestAcrossShadow(anchor, NAMED_REGION); region;) {
      const name = region === labelElement ? null : accessibleName(region)
      if (name) return name
      const parent = parentAcrossShadow(region)
      region = parent ? closestAcrossShadow(parent, NAMED_REGION) : null
    }
    const form = formOf(anchor)
    const notBefore = form ? positionOf(index, form) : -1
    return headingText(headingBefore(index, positionOf(index, anchor), notBefore))
  }

  return { section, formTitle }
}
