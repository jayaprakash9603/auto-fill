import { PLUGIN_API_VERSION, type DetectedControl, type FieldDetector } from '@ufa/core'

function isEditable(element: Element | null | undefined): element is Element {
  const value = element?.getAttribute('contenteditable')
  return value != null && value.toLowerCase() !== 'false'
}

/** Top-level rich-text regions (`contenteditable`) that no earlier detector claimed. */
export const contentEditableDetector: FieldDetector = {
  id: 'ufa.contenteditable',
  apiVersion: PLUGIN_API_VERSION,
  order: 300,
  detect(root, context) {
    const controls: DetectedControl[] = []
    for (const element of root.querySelectorAll('[contenteditable]')) {
      if (!isEditable(element) || context.isClaimed(element)) continue
      if (element.localName === 'body' || element.localName === 'html') continue
      if (isEditable(element.parentElement?.closest('[contenteditable]'))) continue
      let claimedAncestor = false
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (context.isClaimed(parent)) {
          claimedAncestor = true
          break
        }
      }
      if (!claimedAncestor) controls.push({ kind: 'contenteditable', element, confidence: 0.8 })
    }
    return controls
  },
}
