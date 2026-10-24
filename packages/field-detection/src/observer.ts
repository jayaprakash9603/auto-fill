import { isInIgnoredRegion } from './dom'

/** Attributes whose changes can add, remove, reveal, relabel or disable a control. */
export const OBSERVED_ATTRIBUTES = [
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-hidden',
  'aria-label',
  'aria-labelledby',
  'aria-readonly',
  'aria-required',
  'aria-selected',
  'class',
  'contenteditable',
  'disabled',
  'for',
  'hidden',
  'id',
  'inert',
  'multiple',
  'name',
  'open',
  'placeholder',
  'readonly',
  'required',
  'role',
  'style',
  'type',
]

export interface FieldObserverOptions {
  document: Document
  /** Called once mutations have settled for `debounceMs`. */
  onChange: () => void
  /** Extra roots to watch, such as open shadow roots found by the last scan. */
  getRoots?: () => readonly Node[]
  debounceMs?: number
}

export interface FieldObserver {
  /** Starts watching the document (idempotent). */
  start(): void
  /** Re-attaches to the current set of roots, picking up shadow roots found since `start`. */
  refresh(): void
  stop(): void
}

/**
 * Debounced MutationObserver over a document and its open shadow roots. It only signals that the
 * structure may have changed; the caller rescans and decides whether anything relevant changed.
 */
export function createFieldObserver(options: FieldObserverOptions): FieldObserver {
  const debounceMs = options.debounceMs ?? 300
  const MutationObserverImpl = options.document.defaultView?.MutationObserver ?? MutationObserver
  let observer: MutationObserver | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      options.onChange()
    }, debounceMs)
  }
  const onMutations = (records: MutationRecord[]) => {
    if (records.every((record) => isInIgnoredRegion(record.target))) return
    schedule()
  }

  const attach = () => {
    if (!observer) return
    const roots = [options.document, ...(options.getRoots?.() ?? [])]
    for (const root of roots) {
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: OBSERVED_ATTRIBUTES,
      })
    }
  }

  return {
    start() {
      if (observer) return
      observer = new MutationObserverImpl(onMutations)
      attach()
    },
    refresh() {
      if (!observer) return
      const pending = observer.takeRecords()
      if (pending.length > 0) onMutations(pending)
      observer.disconnect()
      attach()
    },
    stop() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      observer?.disconnect()
      observer = null
    },
  }
}
