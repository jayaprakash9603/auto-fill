import { normalizeValue } from '@ufa/core'

import { collapse, isShown } from './dom'

export interface ListOption {
  element: Element
  value: string
  label: string
  selected: boolean
  disabled: boolean
}

function byId(anchor: Element, id: string): Element | null {
  const root = anchor.getRootNode() as Document | ShadowRoot
  return (
    (typeof root.getElementById === 'function' ? root.getElementById(id) : null) ??
    anchor.ownerDocument.getElementById(id)
  )
}

function referenced(anchor: Element, attribute: string): Element[] {
  return (anchor.getAttribute(attribute) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => byId(anchor, id))
    .filter((element): element is Element => element !== null)
}

/**
 * The listbox a combobox controls. Many widgets only render it, or only point at it, while open,
 * so callers look it up again after opening.
 */
export function findListbox(combobox: Element): Element | null {
  for (const attribute of ['aria-controls', 'aria-owns']) {
    for (const target of referenced(combobox, attribute)) {
      if (target.getAttribute('role') === 'listbox') return target
      const inner = target.querySelector('[role="listbox"]')
      if (inner) return inner
    }
  }
  const active = referenced(combobox, 'aria-activedescendant')[0]
  return active?.closest('[role="listbox"]') ?? combobox.querySelector('[role="listbox"]')
}

export function listOptions(listbox: Element): ListOption[] {
  return Array.from(listbox.querySelectorAll('[role="option"]'), (element) => {
    const label = element.getAttribute('aria-label') ?? collapse(element.textContent)
    return {
      element,
      value: element.getAttribute('data-value') ?? label,
      label,
      selected:
        element.getAttribute('aria-selected') === 'true' ||
        element.getAttribute('aria-checked') === 'true',
      disabled: element.getAttribute('aria-disabled') === 'true',
    }
  })
}

export function isListboxOpen(combobox: Element, listbox: Element | null): boolean {
  if (combobox.getAttribute('aria-expanded') === 'true') return true
  return !!listbox && isShown(listbox)
}

/**
 * The option that stands for `text`: the same value or label, or else the only option that
 * starts with it ("Bengaluru" picks "Bengaluru, Karnataka, India"). Null when nothing or more
 * than one option fits; a guess is never made.
 */
export function pickOption(options: readonly ListOption[], text: string): ListOption | null {
  const wanted = normalizeValue(text)
  if (!wanted) return null
  const enabled = options.filter((option) => !option.disabled)
  const exact = enabled.filter(
    (option) => option.value === text || normalizeValue(option.label) === wanted,
  )
  if (exact.length > 0) return sameValue(exact) ? (exact[0] ?? null) : null
  const prefixed = enabled.filter((option) => normalizeValue(option.label).startsWith(`${wanted} `))
  return prefixed.length === 1 ? (prefixed[0] ?? null) : null
}

/** Options repeated with one value (a duplicated row) are interchangeable; others are not. */
function sameValue(options: readonly ListOption[]): boolean {
  const first = options[0]
  return !!first && options.every((option) => option.value === first.value)
}
