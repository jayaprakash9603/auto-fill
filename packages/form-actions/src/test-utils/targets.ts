import {
  normalizeLabel,
  normalizeValue,
  type ControlTarget,
  type FieldDescriptor,
  type FieldOption,
  type FieldType,
  type MatchCandidate,
  type MatchResult,
} from '@ufa/core'

let fieldCount = 0

export function descriptor(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  fieldCount += 1
  const label = overrides.label ?? 'Field'
  return {
    id: `f${fieldCount}`,
    fingerprint: `fp${fieldCount}`,
    frameId: null,
    order: fieldCount,
    type: 'text',
    labelSource: 'label-for',
    semanticKey: null,
    semanticConfidence: 0,
    semanticReason: null,
    placeholder: null,
    name: null,
    htmlId: null,
    autocomplete: null,
    inputMode: null,
    maxLength: null,
    aria: {
      role: null,
      label: null,
      description: null,
      required: false,
      invalid: false,
      expanded: null,
      controls: null,
    },
    section: null,
    formTitle: null,
    required: false,
    visible: true,
    editable: true,
    hasValue: false,
    currentValue: null,
    options: [],
    multiple: false,
    sensitivity: 'normal',
    sensitivityReason: null,
    support: 'supported',
    unsupportedReason: null,
    detectorId: 'test',
    detectionConfidence: 1,
    portalAdapterId: null,
    inShadowRoot: false,
    ...overrides,
    label,
    normalizedLabel: overrides.normalizedLabel ?? normalizeLabel(label),
  }
}

function toOption(value: string, label: string, selected: boolean, disabled: boolean): FieldOption {
  return { value, label, normalizedLabel: normalizeValue(label), selected, disabled }
}

/** Options the way detection reports them, in element order. */
function optionsOf(element: Element, members: readonly Element[]): FieldOption[] {
  if (element.localName === 'select') {
    return Array.from((element as HTMLSelectElement).options, (entry) =>
      toOption(entry.value, entry.label || entry.text, entry.selected, entry.disabled),
    )
  }
  const items = members.length > 0 ? members : Array.from(element.querySelectorAll('[role="option"]'))
  return items.map((item) => {
    const label = item.getAttribute('aria-label') ?? (item.textContent ?? '').trim()
    if (item.localName === 'input') {
      const input = item as HTMLInputElement
      return toOption(input.value, label, input.checked, input.disabled)
    }
    return toOption(
      item.getAttribute('data-value') ?? label,
      label,
      item.getAttribute('aria-checked') === 'true' || item.getAttribute('aria-selected') === 'true',
      item.getAttribute('aria-disabled') === 'true',
    )
  })
}

export function target(
  element: Element,
  type: FieldType,
  overrides: { members?: Element[]; field?: Partial<FieldDescriptor> } = {},
): ControlTarget {
  const members = overrides.members ?? []
  return {
    element,
    members,
    field: descriptor({ type, options: optionsOf(element, members), ...overrides.field }),
  }
}

export function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

export function $<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`No element for ${selector}`)
  return element
}

export function $$<T extends Element = HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector))
}

export function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    answerId: 'a1',
    strategyId: 'semantic-key',
    confidence: { score: 0.95, level: 'high' },
    explanation: 'Same semantic key',
    fillValue: { kind: 'text', text: 'Ada' },
    compatible: true,
    incompatibilityReason: null,
    profileId: null,
    ...overrides,
  }
}

export function matchResult(overrides: Partial<MatchResult> = {}): MatchResult {
  const best = overrides.best === undefined ? candidate() : overrides.best
  return {
    fieldId: 'f',
    state: 'matched',
    candidates: best ? [best] : [],
    reason: null,
    ...overrides,
    best,
  }
}
