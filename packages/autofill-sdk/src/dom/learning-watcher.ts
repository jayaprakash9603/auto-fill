import { isInIgnoredRegion } from '@ufa/field-detection'
import { readControlValue } from '@ufa/form-actions'
import type { FieldDescriptor, FieldValue } from '@ufa/core'

import type { FieldScanner } from '@ufa/field-detection'

export interface LearningWatcher {
  setArmed(armed: boolean): void
  /** Ignores user input briefly after a programmatic fill. */
  suppress(ms: number): void
  start(): void
  stop(): void
}

export function createLearningWatcher(options: {
  document: Document
  getScanner: () => FieldScanner
  onInput(field: FieldDescriptor, value: FieldValue): void
  debounceMs?: number
}): LearningWatcher {
  const debounceMs = options.debounceMs ?? 400
  let armed = false
  let ignoreUntil = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Element | null = null

  const flush = () => {
    timer = undefined
    const element = pending
    pending = null
    if (!armed || !element || Date.now() < ignoreUntil) return
    if (isInIgnoredRegion(element)) return
    const target = options.getScanner().findForElement(element)
    if (!target) return
    const value = readControlValue(target)
    if (!value) return
    options.onInput(target.field, value)
  }

  const schedule = (element: Element) => {
    pending = element
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }

  const onEvent = (event: Event) => {
    if (!armed) return
    const target = event.target
    if (!(target instanceof Element)) return
    schedule(target)
  }

  return {
    setArmed(value) {
      armed = value
    },
    suppress(ms) {
      ignoreUntil = Date.now() + ms
    },
    start() {
      options.document.addEventListener('input', onEvent, true)
      options.document.addEventListener('change', onEvent, true)
    },
    stop() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      pending = null
      options.document.removeEventListener('input', onEvent, true)
      options.document.removeEventListener('change', onEvent, true)
    },
  }
}
