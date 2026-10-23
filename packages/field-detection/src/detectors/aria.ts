import {
  PLUGIN_API_VERSION,
  type DetectedControl,
  type DetectionContext,
  type FieldDetector,
} from '@ufa/core'

import { isNativeControl } from '../dom'

const WIDGET_ROLES = [
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'radiogroup',
  'checkbox',
  'switch',
  'spinbutton',
  'slider',
]

const WIDGET_SELECTOR = WIDGET_ROLES.map((role) => `[role~="${role}"]`).join(',')

function primaryRole(element: Element): string {
  return (element.getAttribute('role') ?? '').trim().toLowerCase().split(/\s+/)[0] ?? ''
}

function isEditable(element: Element): boolean {
  const value = element.getAttribute('contenteditable')
  return value !== null && value.toLowerCase() !== 'false'
}

/** True when a native control inside the widget was already detected (e.g. a combobox wrapper). */
function wrapsClaimedControl(element: Element, context: DetectionContext): boolean {
  for (const inner of element.querySelectorAll('input, select, textarea')) {
    if (context.isClaimed(inner)) return true
  }
  return false
}

/** Ids of listboxes that belong to a combobox; those are part of the combobox, not fields. */
function controlledListboxIds(root: ParentNode): Set<string> {
  const ids = new Set<string>()
  for (const combobox of root.querySelectorAll('[role~="combobox"]')) {
    for (const attribute of ['aria-controls', 'aria-owns']) {
      for (const id of (combobox.getAttribute(attribute) ?? '').split(/\s+/)) if (id) ids.add(id)
    }
  }
  return ids
}

/**
 * Custom widgets exposed through ARIA roles. Sliders and spin buttons are reported as unsupported
 * rather than guessed at; listboxes owned by a combobox are folded into that combobox.
 */
export const ariaWidgetsDetector: FieldDetector = {
  id: 'ufa.aria-widgets',
  apiVersion: PLUGIN_API_VERSION,
  order: 200,
  detect(root, context) {
    const controls: DetectedControl[] = []
    const ownedListboxes = controlledListboxIds(root)

    for (const element of root.querySelectorAll(WIDGET_SELECTOR)) {
      if (context.isClaimed(element) || isNativeControl(element)) continue
      if (wrapsClaimedControl(element, context)) continue
      const confidence = 0.9
      switch (primaryRole(element)) {
        case 'textbox':
        case 'searchbox':
          controls.push(
            isEditable(element)
              ? { kind: 'contenteditable', element, confidence }
              : {
                  kind: 'text',
                  element,
                  confidence,
                  unsupportedReason: 'This custom text box has no editable area.',
                },
          )
          break
        case 'combobox':
          controls.push({ kind: 'combobox', element, confidence })
          break
        case 'listbox': {
          const id = element.getAttribute('id')
          if (
            (id && ownedListboxes.has(id)) ||
            element.parentElement?.closest('[role~="combobox"]')
          )
            break
          const multiple = element.getAttribute('aria-multiselectable') === 'true'
          controls.push({ kind: multiple ? 'multiselect' : 'select', element, confidence })
          break
        }
        case 'radiogroup': {
          const members = Array.from(element.querySelectorAll('[role~="radio"]')).filter(
            (member) => !isNativeControl(member),
          )
          if (members.length > 0)
            controls.push({ kind: 'radio-group', element, members, confidence })
          break
        }
        case 'checkbox':
        case 'switch':
          controls.push({ kind: 'checkbox', element, confidence })
          break
        case 'spinbutton':
          controls.push({
            kind: 'number',
            element,
            confidence,
            unsupportedReason: 'Custom number spinners are not supported yet.',
          })
          break
        case 'slider':
          controls.push({
            kind: 'range',
            element,
            confidence,
            unsupportedReason: 'Sliders are not supported yet.',
          })
          break
        default:
          break
      }
    }
    return controls
  },
}
