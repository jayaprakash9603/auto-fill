import { closestAcrossShadow, parentAcrossShadow } from './dom'

/** False in environments without layout (jsdom), where geometry checks would hide everything. */
export function documentHasLayout(doc: Document): boolean {
  const rect = doc.documentElement?.getBoundingClientRect()
  return !!rect && (rect.width > 0 || rect.height > 0)
}

function hiddenBySelf(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true
  const parent = element.parentElement
  if (parent?.localName === 'details' && !parent.hasAttribute('open')) {
    if (element.localName !== 'summary') return true
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (!style) return false
  return (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse' ||
    style.getPropertyValue('content-visibility') === 'hidden'
  )
}

/**
 * Builds a visibility check for one scan. Uses `checkVisibility` and geometry when the document
 * has layout, so collapsed and off-screen honeypot inputs count as hidden; otherwise falls back
 * to walking computed styles. Results for ancestors are cached for the lifetime of the probe.
 */
export function createVisibilityProbe(doc: Document): (element: Element) => boolean {
  const layout = documentHasLayout(doc)
  const hiddenCache = new Map<Element, boolean>()

  const hiddenByStyle = (start: Element): boolean => {
    const chain: Element[] = []
    let current: Element | null = start
    let hidden = false
    while (current) {
      const cached = hiddenCache.get(current)
      if (cached !== undefined) {
        hidden = cached
        break
      }
      chain.push(current)
      if (hiddenBySelf(current)) {
        hidden = true
        break
      }
      current = parentAcrossShadow(current)
    }
    for (const element of chain) hiddenCache.set(element, hidden)
    return hidden
  }

  return (element) => {
    // Controls removed from the accessibility tree are either inert or honeypots.
    if (closestAcrossShadow(element, '[inert], [aria-hidden="true"]')) return false
    if (layout && typeof element.checkVisibility === 'function') {
      if (!element.checkVisibility({ visibilityProperty: true })) return false
    } else if (hiddenByStyle(element)) {
      return false
    }
    if (!layout) return true
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 && rect.height < 2) return false
    const view = doc.defaultView
    if (view && (rect.right + view.scrollX <= 0 || rect.bottom + view.scrollY <= 0)) return false
    return true
  }
}
