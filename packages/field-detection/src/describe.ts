import {
  classifySensitivity,
  isFieldValueEmpty,
  normalizeLabel,
  type DetectedControl,
  type FieldAria,
  type FieldDescriptor,
  type FieldOption,
} from '@ufa/core'

import type { createContextResolver } from './context'
import {
  attr,
  clip,
  clipOrNull,
  inShadowRoot,
  inputTypeOf,
  isDisabled,
  isInput,
  isSelect,
  isTextArea,
  labelsOf,
} from './dom'
import { fingerprintOf } from './identity'
import {
  resolveControlLabel,
  resolveDescription,
  resolveGroupLabel,
  type ResolvedGroupLabel,
} from './labels'
import { comboboxOptions, listboxOptions, memberOptions, selectOptions } from './options'
import { MAX_TEXT_LENGTH, cleanLabel } from './text'
import { readCurrentValue } from './values'

const DEFAULT_CONFIDENCE = 0.8
const INVALID_VALUES = new Set(['true', 'grammar', 'spelling'])

export interface DescribeEnvironment {
  isVisible(element: Element): boolean
  context: ReturnType<typeof createContextResolver>
  /** Legend of the fieldset around `element` when it holds no other detected control. */
  soleFieldsetLegend(element: Element): Element | null
}

/** A described control: the descriptor (without session id and order) plus its live elements. */
export interface DescribedControl {
  anchor: Element
  element: Element
  members: readonly Element[]
  field: Omit<FieldDescriptor, 'id' | 'order'>
}

function isReadOnly(element: Element): boolean {
  if ((isInput(element) || isTextArea(element)) && element.readOnly) return true
  return element.getAttribute('aria-readonly') === 'true'
}

function readOptions(control: DetectedControl): FieldOption[] {
  const { kind, element, members } = control
  if (members && members.length > 0) return memberOptions(members)
  if (isSelect(element)) return selectOptions(element)
  if (kind === 'combobox') return comboboxOptions(element)
  if (kind === 'select' || kind === 'multiselect') return listboxOptions(element)
  return []
}

function resolveLabel(
  control: DetectedControl,
  isGroup: boolean,
  env: DescribeEnvironment,
): ResolvedGroupLabel {
  if (control.labelOverride) {
    const cleaned = cleanLabel(control.labelOverride)
    return {
      text: cleaned.text,
      source: 'adapter',
      required: cleaned.required,
      sectionHint: null,
      labelElement: null,
    }
  }
  if (isGroup) return resolveGroupLabel(control.element, control.members ?? [])
  const legend = env.soleFieldsetLegend(control.element)
  const label = resolveControlLabel(control.element, { soleFieldsetLegend: legend })
  return { ...label, sectionHint: null, labelElement: label.source === 'legend' ? legend : null }
}

export function describeControl(
  control: DetectedControl,
  detectorId: string,
  env: DescribeEnvironment,
): DescribedControl {
  const { kind: type, element } = control
  const members = control.members ?? []
  const isGroup = type === 'radio-group' || type === 'checkbox-group'
  const anchor = members[0] ?? element
  const primary = isGroup ? anchor : element

  const label = resolveLabel(control, isGroup, env)
  const labelText = clip(label.text, MAX_TEXT_LENGTH)
  const normalizedLabel = normalizeLabel(labelText)
  const name = clipOrNull(attr(primary, 'name'), 500)
  const htmlId = clipOrNull(attr(isGroup && element !== anchor ? element : primary, 'id'), 500)
  const placeholder = clipOrNull(
    attr(element, 'placeholder') ??
      attr(element, 'aria-placeholder') ??
      attr(element, 'data-placeholder'),
    1_000,
  )
  const autocomplete = clipOrNull(attr(primary, 'autocomplete'), 200)
  const expanded = element.getAttribute('aria-expanded')
  const aria: FieldAria = {
    role: clipOrNull(attr(element, 'role'), 100),
    label: clipOrNull(attr(element, 'aria-label'), 1_000),
    description: resolveDescription(element) ?? (isGroup ? resolveDescription(anchor) : null),
    required: element.getAttribute('aria-required') === 'true',
    invalid: INVALID_VALUES.has(element.getAttribute('aria-invalid') ?? ''),
    expanded: expanded === 'true' ? true : expanded === 'false' ? false : null,
    controls: clipOrNull(attr(element, 'aria-controls'), 500),
  }

  const verdict = classifySensitivity({
    type,
    inputType: inputTypeOf(primary),
    autocomplete,
    label: labelText,
    name,
    htmlId: attr(primary, 'id'),
    placeholder,
    ariaLabel: aria.label,
  })
  const prohibited = verdict.sensitivity === 'prohibited'
  const options = prohibited ? [] : readOptions(control)
  const currentValue = prohibited ? null : readCurrentValue(type, element, options, placeholder)

  const choiceTargets = members.length > 0 ? members : [element]
  const visible =
    isGroup || (type === 'checkbox' && isInput(element))
      ? choiceTargets.some(
          (target) =>
            env.isVisible(target) || labelsOf(target).some((entry) => env.isVisible(entry)),
        )
      : env.isVisible(element)
  const disabled = isGroup ? members.every(isDisabled) : isDisabled(element)
  const required =
    label.required ||
    aria.required ||
    choiceTargets.some((target) => target.hasAttribute('required'))
  const maxLength =
    (isInput(element) || isTextArea(element)) && element.maxLength >= 0 ? element.maxLength : null
  const unsupportedReason =
    control.unsupportedReason ??
    (type === 'unknown' ? 'This control type is not recognized.' : null)

  return {
    anchor,
    element,
    members,
    field: {
      fingerprint: fingerprintOf({
        type,
        tag: element.localName,
        inputType: inputTypeOf(primary),
        name,
        htmlId: attr(primary, 'id'),
        normalizedLabel,
        memberCount: members.length,
      }),
      frameId: null,
      type,
      label: labelText,
      normalizedLabel,
      labelSource: label.source,
      semanticKey: null,
      semanticConfidence: 0,
      placeholder,
      name,
      htmlId,
      autocomplete,
      inputMode: clipOrNull(attr(element, 'inputmode'), 50),
      maxLength,
      aria,
      section: env.context.section({
        anchor,
        labelElement: label.labelElement,
        sectionHint: label.sectionHint,
      }),
      formTitle: env.context.formTitle(anchor),
      required,
      visible,
      editable: !disabled && !isReadOnly(element),
      hasValue: currentValue !== null && !isFieldValueEmpty(currentValue),
      currentValue,
      options,
      multiple:
        type === 'multiselect' ||
        type === 'checkbox-group' ||
        element.getAttribute('aria-multiselectable') === 'true',
      sensitivity: verdict.sensitivity,
      sensitivityReason: clipOrNull(verdict.reason, 200),
      support: unsupportedReason ? 'unsupported' : 'supported',
      unsupportedReason: clipOrNull(unsupportedReason, 300),
      detectorId: clip(detectorId, 100),
      detectionConfidence: Math.min(1, Math.max(0, control.confidence ?? DEFAULT_CONFIDENCE)),
      portalAdapterId: null,
      inShadowRoot: inShadowRoot(anchor),
    },
  }
}
