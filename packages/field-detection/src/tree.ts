const HEADING = /^h[1-6]$/

/** Upper bound on indexed elements, so pathological pages cannot stall a scan. */
export const MAX_INDEXED_ELEMENTS = 200_000

export interface TreeIndex {
  /** Position of every element in document order, descending into open shadow roots. */
  order: Map<Element, number>
  /** Open shadow roots in document order. */
  shadowRoots: ShadowRoot[]
  /** Headings (`h1`–`h6`, `role="heading"`) in document order. */
  headings: Element[]
}

export function isHeading(element: Element): boolean {
  return HEADING.test(element.localName) || element.getAttribute('role') === 'heading'
}

/**
 * Walks the document depth-first. A shadow host's shadow tree is visited before its light
 * children, which approximates rendered order for the common case of components without slots.
 */
export function indexTree(doc: Document): TreeIndex {
  const order = new Map<Element, number>()
  const shadowRoots: ShadowRoot[] = []
  const headings: Element[] = []
  const stack: Element[] = doc.documentElement ? [doc.documentElement] : []
  while (stack.length > 0 && order.size < MAX_INDEXED_ELEMENTS) {
    const element = stack.pop()!
    order.set(element, order.size)
    if (isHeading(element)) headings.push(element)
    const children: Element[] = []
    const shadow = element.shadowRoot
    if (shadow) {
      shadowRoots.push(shadow)
      children.push(...Array.from(shadow.children))
    }
    children.push(...Array.from(element.children))
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]!)
  }
  return { order, shadowRoots, headings }
}

export function positionOf(index: TreeIndex, element: Element): number {
  return index.order.get(element) ?? Number.MAX_SAFE_INTEGER
}

/** Last heading positioned before `position` and at or after `notBefore`. */
export function headingBefore(index: TreeIndex, position: number, notBefore = -1): Element | null {
  let low = 0
  let high = index.headings.length - 1
  let found: Element | null = null
  while (low <= high) {
    const middle = (low + high) >> 1
    const heading = index.headings[middle]!
    const headingPosition = positionOf(index, heading)
    if (headingPosition < position) {
      found = heading
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found && positionOf(index, found) >= notBefore ? found : null
}
