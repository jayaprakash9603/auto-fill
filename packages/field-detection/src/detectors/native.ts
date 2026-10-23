import {
  PLUGIN_API_VERSION,
  type DetectedControl,
  type FieldDetector,
  type FieldType,
} from '@ufa/core'

import { attr, isInput, isSelect, isTextArea } from '../dom'

const SKIPPED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image'])

const INPUT_FIELD_TYPES: Readonly<Record<string, FieldType>> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  date: 'date',
  'datetime-local': 'datetime-local',
  month: 'month',
  week: 'week',
  time: 'time',
  search: 'search',
  password: 'password',
  file: 'file',
  range: 'range',
  color: 'color',
}

export const UNSUPPORTED_REASONS: Partial<Readonly<Record<FieldType, string>>> = {
  file: 'File uploads are never automated.',
  range: 'Sliders are not supported yet.',
  color: 'Color pickers are not supported yet.',
}

const CHOICE_CONTAINER = 'fieldset, [role="radiogroup"], [role="group"]'

function hasOtherChoices(container: Element, members: readonly Element[]): boolean {
  for (const input of container.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
    if (!members.includes(input)) return true
  }
  return false
}

/** The tightest element that holds exactly this group's options, or the first option. */
function groupContainer(members: readonly HTMLInputElement[]): Element {
  const first = members[0]!
  const semantic = first.parentElement?.closest(CHOICE_CONTAINER)
  if (
    semantic &&
    members.every((member) => semantic.contains(member)) &&
    !hasOtherChoices(semantic, members)
  ) {
    return semantic
  }
  let ancestor = first.parentElement
  while (ancestor && !members.every((member) => ancestor!.contains(member))) {
    ancestor = ancestor.parentElement
  }
  if (
    ancestor &&
    ancestor.localName !== 'form' &&
    ancestor.localName !== 'body' &&
    !hasOtherChoices(ancestor, members)
  ) {
    return ancestor
  }
  return first
}

function withReason(control: DetectedControl): DetectedControl {
  const reason = UNSUPPORTED_REASONS[control.kind]
  return reason ? { ...control, unsupportedReason: reason } : control
}

/**
 * Inputs, selects and textareas. Radios sharing a name in the same form become one radio group;
 * checkboxes sharing a name become a checkbox group. Inputs inside an ARIA combobox are comboboxes.
 */
export const nativeControlsDetector: FieldDetector = {
  id: 'ufa.native-controls',
  apiVersion: PLUGIN_API_VERSION,
  order: 100,
  detect(root, context) {
    const controls: DetectedControl[] = []
    const groups = new Map<string, { type: 'radio' | 'checkbox'; members: HTMLInputElement[] }>()
    const scopeIds = new WeakMap<object, number>()
    let nextScope = 0
    const scopeKey = (scope: object) => {
      let id = scopeIds.get(scope)
      if (id === undefined) {
        nextScope += 1
        id = nextScope
        scopeIds.set(scope, id)
      }
      return id
    }

    for (const element of root.querySelectorAll('input, select, textarea')) {
      if (context.isClaimed(element)) continue
      if (isSelect(element)) {
        controls.push({ kind: element.multiple ? 'multiselect' : 'select', element, confidence: 1 })
        continue
      }
      if (isTextArea(element)) {
        controls.push({ kind: 'textarea', element, confidence: 1 })
        continue
      }
      if (!isInput(element)) continue
      const type = element.type.toLowerCase()
      if (SKIPPED_INPUT_TYPES.has(type)) continue

      if (type === 'radio' || type === 'checkbox') {
        const name = attr(element, 'name')
        const container = name ? null : element.parentElement?.closest(CHOICE_CONTAINER)
        const key = name
          ? `${type}|${scopeKey(element.form ?? element.getRootNode())}|${name}`
          : container
            ? `${type}|container:${scopeKey(container)}`
            : null
        if (key === null) {
          controls.push(
            type === 'radio'
              ? { kind: 'radio-group', element, members: [element], confidence: 1 }
              : { kind: 'checkbox', element, confidence: 1 },
          )
          continue
        }
        const group = groups.get(key) ?? { type, members: [] }
        group.members.push(element)
        groups.set(key, group)
        continue
      }

      const insideCombobox =
        element.getAttribute('role') === 'combobox' ||
        element.parentElement?.closest('[role="combobox"]') != null
      const kind: FieldType = insideCombobox ? 'combobox' : (INPUT_FIELD_TYPES[type] ?? 'text')
      controls.push(withReason({ kind, element, confidence: 1 }))
    }

    for (const { type, members } of groups.values()) {
      if (type === 'checkbox' && members.length === 1) {
        controls.push({ kind: 'checkbox', element: members[0]!, confidence: 1 })
        continue
      }
      controls.push({
        kind: type === 'radio' ? 'radio-group' : 'checkbox-group',
        element: groupContainer(members),
        members,
        confidence: 1,
      })
    }
    return controls
  },
}
