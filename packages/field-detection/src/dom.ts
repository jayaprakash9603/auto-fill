/**
 * DOM helpers that never use `instanceof`: elements may come from another realm (an iframe, a
 * jsdom window), where constructor identity checks fail.
 */

export type ControlRoot = Document | ShadowRoot

export type NativeControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

export function isElement(node: Node | null | undefined): node is Element {
  return !!node && node.nodeType === 1
}

export function isShadowRoot(node: Node | null | undefined): node is ShadowRoot {
  return !!node && node.nodeType === 11 && !!(node as Partial<ShadowRoot>).host
}

export function isInput(element: Element): element is HTMLInputElement {
  return element.localName === 'input'
}

export function isSelect(element: Element): element is HTMLSelectElement {
  return element.localName === 'select'
}

export function isTextArea(element: Element): element is HTMLTextAreaElement {
  return element.localName === 'textarea'
}

export function isNativeControl(element: Element): element is NativeControl {
  return isInput(element) || isSelect(element) || isTextArea(element)
}

/** Normalized `type` of an input ("text" for unknown types); null for other elements. */
export function inputTypeOf(element: Element): string | null {
  return isInput(element) ? element.type.toLowerCase() : null
}

/** Trimmed attribute value, or null when missing or blank. */
export function attr(element: Element, name: string): string | null {
  const value = element.getAttribute(name)?.trim()
  return value ? value : null
}

export function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

export function clipOrNull(value: string | null, max: number): string | null {
  return value === null ? null : clip(value, max)
}

/** Parent element, stepping from a shadow root to its host. */
export function parentAcrossShadow(node: Node): Element | null {
  if (node.parentElement) return node.parentElement
  const parent = node.parentNode
  return isShadowRoot(parent) ? parent.host : null
}

/** `closest()` that continues through shadow hosts. */
export function closestAcrossShadow(element: Element, selector: string): Element | null {
  let current: Element | null = element
  while (current) {
    const found = current.closest(selector)
    if (found) return found
    const root = current.getRootNode()
    current = isShadowRoot(root) ? root.host : null
  }
  return null
}

export function rootOf(element: Element): ControlRoot {
  const root = element.getRootNode()
  return isShadowRoot(root) ? root : element.ownerDocument
}

export function inShadowRoot(element: Element): boolean {
  return isShadowRoot(element.getRootNode())
}

/** Elements referenced by an id-list attribute such as `aria-labelledby`, within the same tree. */
export function idRefs(element: Element, attribute: string): Element[] {
  const raw = attr(element, attribute)
  if (!raw) return []
  const root = rootOf(element)
  return raw
    .split(/\s+/)
    .map((id) => root.getElementById(id))
    .filter((entry): entry is HTMLElement => entry !== null)
}

/** `<label>` elements associated with a control: native `labels`, then `label[for]` in the tree. */
export function labelsOf(element: Element): Element[] {
  const native = (element as Partial<HTMLInputElement>).labels
  if (native && native.length > 0) return Array.from(native)
  const found: Element[] = []
  const id = element.getAttribute('id')
  if (id) {
    for (const label of rootOf(element).querySelectorAll('label[for]')) {
      if (label.getAttribute('for') === id) found.push(label)
    }
  }
  const wrapping = element.parentElement?.closest('label')
  if (wrapping && !found.includes(wrapping)) found.push(wrapping)
  return found
}

const CONTROL_SELECTOR = [
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="radiogroup"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
].join(',')

/** True when the element is, or contains, something a user could type into or choose. */
export function containsControl(element: Element): boolean {
  return element.matches(CONTROL_SELECTOR) || element.querySelector(CONTROL_SELECTOR) !== null
}

/** The fieldset's own legend (its first `legend` child), without `:scope` selectors. */
export function legendOf(fieldset: Element): Element | null {
  for (const child of fieldset.children) if (child.localName === 'legend') return child
  return null
}

/** Disabled natively (including through a disabled fieldset) or through `aria-disabled`. */
export function isDisabled(element: Element): boolean {
  if (element.hasAttribute('disabled')) return true
  if (closestAcrossShadow(element, '[aria-disabled="true"]')) return true
  let fieldset = element.parentElement?.closest('fieldset[disabled]') ?? null
  while (fieldset) {
    if (!legendOf(fieldset)?.contains(element)) return true
    fieldset = fieldset.parentElement?.closest('fieldset[disabled]') ?? null
  }
  return false
}
