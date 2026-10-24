import type { ControlOutcome, ControlTarget, FieldValue } from '@ufa/core'

import {
  activate,
  blur,
  collapse,
  dispatchChange,
  dispatchInput,
  focus,
  isContentEditable,
  isInput,
  isSelect,
  isTextArea,
  pressKey,
  setNativeChecked,
  setNativeValue,
  settle,
  waitFor,
} from './dom'
import { findListbox, isListboxOpen, listOptions, pickOption, type ListOption } from './listbox'
import { isMemberChecked, optionValueAt, readControlValue, valueMatches } from './read'

export interface ControlFillOptions {
  /** How long to wait for options that load after a dropdown opens or after typing. */
  optionTimeoutMs: number
}

export const DEFAULT_OPTION_TIMEOUT_MS = 3_000
/** How long a typed combobox waits for any suggestion before keeping the text as typed. */
const FIRST_SUGGESTION_MS = 1_500

const done: ControlOutcome = { ok: true, verified: true, reason: null }

function failed(reason: string): ControlOutcome {
  return { ok: false, verified: false, reason }
}

/** Compares what the control shows now with what was written. */
function verify(target: ControlTarget, expected: FieldValue): ControlOutcome {
  if (valueMatches(target.field, expected, readControlValue(target))) return done
  return failed('The page did not keep the value.')
}

async function fillText(target: ControlTarget, text: string): Promise<ControlOutcome> {
  const { element } = target
  if (!isInput(element) && !isTextArea(element)) {
    return isContentEditable(element)
      ? fillEditable(target, text)
      : failed('This control has no editable text.')
  }
  if (element.maxLength > 0 && text.length > element.maxLength)
    return failed(`Longer than the ${element.maxLength} characters this field allows.`)
  focus(element)
  setNativeValue(element, text)
  dispatchInput(element, text)
  dispatchChange(element)
  blur(element)
  await settle()
  const outcome = verify(target, { kind: 'text', text })
  if (outcome.ok || collapse(element.value) === '') return outcome
  return { ok: true, verified: false, reason: 'The page reformatted the value; check it.' }
}

/**
 * Rich editors keep their own model of the content, so text goes in through the editing command
 * they listen to; plain contenteditable elements get the text directly.
 */
async function fillEditable(target: ControlTarget, text: string): Promise<ControlOutcome> {
  const { element } = target
  const doc = element.ownerDocument
  focus(element)
  let inserted = false
  const selection = doc.getSelection?.()
  if (selection && typeof doc.execCommand === 'function') {
    const range = doc.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
    try {
      inserted = doc.execCommand('insertText', false, text)
    } catch {
      inserted = false
    }
  }
  if (!inserted || collapse(element.textContent) !== collapse(text)) {
    element.textContent = text
    dispatchInput(element, text)
  }
  blur(element)
  await settle()
  return verify(target, { kind: 'text', text })
}

async function fillCheckbox(target: ControlTarget, checked: boolean): Promise<ControlOutcome> {
  const { element } = target
  if (isMemberChecked(element) === checked) return done
  if (isInput(element)) element.click()
  else activate(element)
  await settle()
  if (isMemberChecked(element) !== checked) {
    if (isInput(element)) {
      setNativeChecked(element, checked)
      dispatchInput(element, null)
      dispatchChange(element)
    } else {
      focus(element)
      pressKey(element, ' ')
    }
    await settle()
  }
  return isMemberChecked(element) === checked ? done : failed('The page did not keep the change.')
}

/** Clicks a group member; native radios that ignore the click are set directly. */
async function toggleMember(member: Element, checked: boolean): Promise<void> {
  if (isInput(member)) member.click()
  else activate(member)
  await settle()
  if (isInput(member) && member.checked !== checked) {
    setNativeChecked(member, checked)
    dispatchInput(member, null)
    dispatchChange(member)
    await settle()
  }
}

async function fillGroup(target: ControlTarget, values: readonly string[]): Promise<ControlOutcome> {
  const { field, members } = target
  const memberValues = members.map((member, index) => optionValueAt(field, index, member))
  if (values.some((value) => !memberValues.includes(value)))
    return failed('That option is not on the page.')
  const wanted = new Set(values)
  if (field.type === 'radio-group') {
    if (values.length > 1) return failed('Only one option can be chosen.')
    const index = memberValues.findIndex((value) => wanted.has(value))
    const member = index >= 0 ? members[index] : undefined
    if (member) {
      if (field.options[index]?.disabled) return failed('That option is disabled.')
      if (!isMemberChecked(member)) await toggleMember(member, true)
    } else {
      for (const checked of members.filter(isMemberChecked)) {
        if (!isInput(checked)) return failed('This choice cannot be unselected.')
        await toggleMember(checked, false)
      }
    }
  } else {
    for (const [index, member] of members.entries()) {
      const desired = wanted.has(memberValues[index] ?? '')
      if (isMemberChecked(member) === desired) continue
      if (field.options[index]?.disabled) return failed('That option is disabled.')
      await toggleMember(member, desired)
    }
  }
  return verify(target, { kind: 'options', values: [...values] })
}

async function fillSelect(
  target: ControlTarget,
  select: HTMLSelectElement,
  values: readonly string[],
  options: ControlFillOptions,
): Promise<ControlOutcome> {
  if (!select.multiple && values.length > 1) return failed('Only one option can be chosen.')
  const available = () => {
    const found = values.map((value) =>
      Array.from(select.options).find((option) => option.value === value),
    )
    return found.every(Boolean) ? (found as HTMLOptionElement[]) : null
  }
  // Dependent selects load their options after an earlier answer.
  const found = await waitFor(available, options.optionTimeoutMs)
  if (!found) return failed('That option is not on the page.')
  if (found.some((option) => option.disabled)) return failed('That option is disabled.')
  focus(select)
  if (select.multiple) {
    const wanted = new Set(values)
    for (const option of Array.from(select.options)) option.selected = wanted.has(option.value)
  } else {
    setNativeValue(select, values[0] ?? '')
  }
  dispatchInput(select, null)
  dispatchChange(select)
  blur(select)
  await settle()
  return verify(target, { kind: 'options', values: [...values] })
}

/** Standalone ARIA listboxes (`role="listbox"` that is not part of a combobox). */
async function fillListbox(
  target: ControlTarget,
  values: readonly string[],
): Promise<ControlOutcome> {
  const { element, field } = target
  const optionElements = Array.from(element.querySelectorAll('[role="option"]'))
  const optionValues = optionElements.map((option, index) => optionValueAt(field, index, option))
  if (values.some((value) => !optionValues.includes(value)))
    return failed('That option is not on the page.')
  const wanted = new Set(values)
  const multiple = element.getAttribute('aria-multiselectable') === 'true'
  if (!multiple && values.length > 1) return failed('Only one option can be chosen.')
  const options = listOptions(element)
  for (const [index, option] of options.entries()) {
    const desired = wanted.has(optionValues[index] ?? '')
    if (option.selected === desired || (!multiple && !desired)) continue
    if (option.disabled) return failed('That option is disabled.')
    activate(option.element)
    await settle()
  }
  return verify(target, { kind: 'options', values: [...values] })
}

function currentOptions(combobox: Element): ListOption[] {
  const listbox = findListbox(combobox)
  return listbox ? listOptions(listbox) : []
}

/** Opens a select-only combobox: a click first, then the keyboard pattern from the ARIA spec. */
async function openCombobox(combobox: Element): Promise<void> {
  if (isListboxOpen(combobox, findListbox(combobox))) return
  activate(combobox)
  await settle()
  if (isListboxOpen(combobox, findListbox(combobox))) return
  focus(combobox)
  pressKey(combobox, 'ArrowDown')
  await settle()
}

async function chooseOption(option: ListOption, combobox: Element): Promise<boolean> {
  activate(option.element)
  await settle()
  if (option.element.getAttribute('aria-selected') === 'true') return true
  return collapse(isInput(combobox) ? combobox.value : combobox.textContent) === option.label
}

async function fillCombobox(
  target: ControlTarget,
  text: string,
  options: ControlFillOptions,
): Promise<ControlOutcome> {
  const { element } = target
  if (isInput(element)) {
    focus(element)
    setNativeValue(element, text)
    dispatchInput(element, text)
    if (text === '') {
      dispatchChange(element)
      await settle()
      return verify(target, { kind: 'text', text })
    }
    // Suggestions often come from the network; stop early when none appear at all.
    const started = Date.now()
    const option = await waitFor(() => {
      const listed = currentOptions(element)
      const pick = pickOption(listed, text)
      if (pick) return pick
      if (listed.length === 0 && Date.now() - started > FIRST_SUGGESTION_MS) return false
      return null
    }, options.optionTimeoutMs)
    if (option) {
      const chosen = await chooseOption(option, element)
      dispatchChange(element)
      await settle()
      if (chosen || verify(target, { kind: 'text', text }).ok) return done
      return { ok: true, verified: false, reason: 'Chose a suggestion; check it.' }
    }
    dispatchChange(element)
    await settle()
    return verify(target, { kind: 'text', text })
  }

  if (text === '') return failed('This dropdown cannot be emptied again.')
  await openCombobox(element)
  const option = await waitFor(
    () => pickOption(currentOptions(element), text),
    options.optionTimeoutMs,
  )
  if (!option) {
    pressKey(element, 'Escape')
    return failed('None of the listed options match.')
  }
  if (await chooseOption(option, element)) return done
  return verify(target, { kind: 'text', text })
}

/**
 * Writes one value into one control and reports whether the page kept it. Values are written
 * through the native setters and announced with input and change events, so framework-controlled
 * inputs update their state; nothing is ever submitted.
 */
export async function fillControl(
  target: ControlTarget,
  value: FieldValue,
  options: ControlFillOptions = { optionTimeoutMs: DEFAULT_OPTION_TIMEOUT_MS },
): Promise<ControlOutcome> {
  const { field, element } = target
  switch (field.type) {
    case 'file':
    case 'password':
    case 'range':
    case 'color':
    case 'unknown':
      return failed('This kind of control is never filled.')
    case 'checkbox':
      return value.kind === 'checked'
        ? fillCheckbox(target, value.checked)
        : failed('The value does not fit a checkbox.')
    case 'radio-group':
    case 'checkbox-group':
      return value.kind === 'options'
        ? fillGroup(target, value.values)
        : failed('The value does not fit this choice.')
    case 'select':
    case 'multiselect':
      if (value.kind !== 'options') return failed('The value does not fit this list.')
      return isSelect(element)
        ? fillSelect(target, element, value.values, options)
        : fillListbox(target, value.values)
    case 'combobox':
      return value.kind === 'text'
        ? fillCombobox(target, value.text, options)
        : failed('The value does not fit this dropdown.')
    case 'contenteditable':
      return value.kind === 'text'
        ? fillEditable(target, value.text)
        : failed('The value does not fit a text area.')
    default:
      return value.kind === 'text'
        ? fillText(target, value.text)
        : failed('The value does not fit a text field.')
  }
}
