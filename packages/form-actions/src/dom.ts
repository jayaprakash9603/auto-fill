type FrameWindow = Window & typeof globalThis

export const isInput = (element: Element): element is HTMLInputElement =>
  element.localName === 'input'
export const isTextArea = (element: Element): element is HTMLTextAreaElement =>
  element.localName === 'textarea'
export const isSelect = (element: Element): element is HTMLSelectElement =>
  element.localName === 'select'

export function isContentEditable(element: Element): boolean {
  const value = element.getAttribute('contenteditable')
  return value !== null && value.toLowerCase() !== 'false'
}

/** The window the element lives in; elements in frames use their own frame's constructors. */
export function windowOf(element: Element): FrameWindow {
  return (element.ownerDocument.defaultView ?? window) as FrameWindow
}

export function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * The setter on the element's prototype chain. React and similar libraries install their own
 * setter on the element instance to track the last value they rendered; writing through the
 * prototype leaves that record stale, so the following input event registers as a change.
 */
function prototypeSetter(element: Element, property: 'value' | 'checked') {
  let prototype: object | null = Object.getPrototypeOf(element) as object | null
  while (prototype) {
    const setter = Object.getOwnPropertyDescriptor(prototype, property)?.set
    if (setter) return setter
    prototype = Object.getPrototypeOf(prototype) as object | null
  }
  return null
}

export function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const setter = prototypeSetter(element, 'value')
  if (setter) setter.call(element, value)
  else element.value = value
}

export function setNativeChecked(element: HTMLInputElement, checked: boolean): void {
  const setter = prototypeSetter(element, 'checked')
  if (setter) setter.call(element, checked)
  else element.checked = checked
}

export function dispatchInput(element: Element, data: string | null): void {
  const win = windowOf(element)
  const init = { bubbles: true, composed: true }
  element.dispatchEvent(
    typeof win.InputEvent === 'function'
      ? new win.InputEvent('input', { ...init, inputType: 'insertReplacementText', data })
      : new win.Event('input', init),
  )
}

export function dispatchChange(element: Element): void {
  element.dispatchEvent(new (windowOf(element).Event)('change', { bubbles: true }))
}

export function focus(element: Element): void {
  ;(element as HTMLElement).focus?.({ preventScroll: true })
}

export function blur(element: Element): void {
  ;(element as HTMLElement).blur?.()
}

/**
 * The pointer and mouse sequence of a real click. Custom widgets listen to different parts of it:
 * many menus open on mousedown, options usually commit on click.
 */
export function activate(element: Element): void {
  const win = windowOf(element)
  const init = { bubbles: true, cancelable: true, composed: true, button: 0 }
  const pointer = { ...init, pointerType: 'mouse', isPrimary: true }
  const Pointer = typeof win.PointerEvent === 'function' ? win.PointerEvent : null
  if (Pointer) element.dispatchEvent(new Pointer('pointerdown', pointer))
  element.dispatchEvent(new win.MouseEvent('mousedown', init))
  if (Pointer) element.dispatchEvent(new Pointer('pointerup', pointer))
  element.dispatchEvent(new win.MouseEvent('mouseup', init))
  const html = element as HTMLElement
  if (typeof html.click === 'function') html.click()
  else element.dispatchEvent(new win.MouseEvent('click', init))
}

const KEY_CODES: Record<string, string> = {
  ' ': 'Space',
  ArrowDown: 'ArrowDown',
  Enter: 'Enter',
  Escape: 'Escape',
}

export function pressKey(element: Element, key: string): void {
  const win = windowOf(element)
  const init = { key, code: KEY_CODES[key] ?? key, bubbles: true, cancelable: true, composed: true }
  element.dispatchEvent(new win.KeyboardEvent('keydown', init))
  element.dispatchEvent(new win.KeyboardEvent('keyup', init))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Gives frameworks a turn to process the events just dispatched and re-render. */
export function settle(): Promise<void> {
  return sleep(0)
}

/** Polls until `probe` returns a value, or resolves null after `timeoutMs`. */
export async function waitFor<T>(
  probe: () => T | null | undefined,
  timeoutMs: number,
  intervalMs = 50,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value !== null && value !== undefined) return value
    if (Date.now() >= deadline) return null
    await sleep(intervalMs)
  }
}

/** True unless the element or an ancestor is hidden by attribute or style. */
export function isShown(element: Element): boolean {
  if (element.closest('[hidden]')) return false
  const style = windowOf(element).getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}
