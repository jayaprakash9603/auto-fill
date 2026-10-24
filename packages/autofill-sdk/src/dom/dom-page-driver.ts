import {
  scanRequestSchema,
  siteFromUrl,
  throwIfAborted,
  type FieldDetector,
  type PortalAdapter,
  type PageDriver,
  type PageEvent,
  type PageInfo,
  type ScanRequest,
} from '@ufa/core'
import {
  BUILTIN_DETECTORS,
  createFieldObserver,
  createFieldScanner,
  fieldsSignature,
  type FieldScanner,
} from '@ufa/field-detection'
import { BUILTIN_PORTAL_ADAPTERS, resolvePortalAdapter } from '@ufa/portal-adapters'
import { createFormActions } from '@ufa/form-actions'

import { createLearningWatcher } from './learning-watcher'
import { SDK_VERSION } from '../version'

export interface DomPageDriverOptions {
  document?: Document
  window?: Window
  /** Extra field detectors after the active portal adapter and before the built-ins. */
  detectors?: readonly FieldDetector[]
  /** Portal adapters to try before the generic fallback. */
  portalAdapters?: readonly PortalAdapter[]
  /** Watch the page after the first scan and emit `fields-changed`. Defaults to true. */
  observe?: boolean
  /** Quiet period before a burst of DOM mutations triggers a rescan. */
  mutationDebounceMs?: number
  /** How long a fill waits for dropdown options that load late. */
  optionTimeoutMs?: number
  onPluginError?: (pluginId: string, error: unknown) => void
}

export interface DomPageDriver extends PageDriver {
  readonly kind: 'dom'
  /** The scanner behind `scan`, for in-page actions that need the live elements. */
  readonly scanner: FieldScanner
  /** Emits an event to subscribers; used by the content runtime to forward page activity. */
  emit(event: PageEvent): void
}

/** Operates on a live document directly: inside a content script, a web app, or a test. */
export function createDomPageDriver(options: DomPageDriverOptions = {}): DomPageDriver {
  const doc = options.document ?? document
  const win = options.window ?? doc.defaultView ?? window
  const listeners = new Set<(event: PageEvent) => void>()
  const portalAdapters = options.portalAdapters ?? BUILTIN_PORTAL_ADAPTERS
  const portalContext = () => ({
    url: win.location.href,
    hostname: siteFromUrl(win.location.href) || win.location.hostname,
    title: doc.title,
    document: doc,
  })
  const runtime = {
    activeAdapter: resolvePortalAdapter(portalContext(), portalAdapters),
    scanner: null as FieldScanner | null,
  }
  const buildScanner = (adapter: PortalAdapter) =>
    createFieldScanner({
      document: doc,
      detectors: [...(adapter.detectors ?? []), ...(options.detectors ?? []), ...BUILTIN_DETECTORS],
      ...(options.onPluginError ? { onPluginError: options.onPluginError } : {}),
    })
  runtime.scanner = buildScanner(runtime.activeAdapter)
  const syncAdapter = () => {
    const next = resolvePortalAdapter(portalContext(), portalAdapters)
    if (next.id === runtime.activeAdapter.id) return
    runtime.activeAdapter = next
    runtime.scanner = buildScanner(next)
  }
  const actions = createFormActions({
    resolve: (fieldId, fingerprint) => runtime.scanner!.resolve(fieldId, fingerprint),
    fillField: async (target, value) => {
      const adapter = runtime.activeAdapter
      if (!adapter.fillField) return null
      return adapter.fillField(target, value, portalContext())
    },
    ...(options.optionTimeoutMs !== undefined ? { optionTimeoutMs: options.optionTimeoutMs } : {}),
  })
  let lastRequest: ScanRequest | null = null
  let lastSignature = ''
  let disposed = false

  const pageInfo = (): PageInfo => ({
    url: win.location.href,
    title: doc.title,
    hostname: siteFromUrl(win.location.href) || win.location.hostname,
    frameCount: 1,
    adapterId: runtime.activeAdapter.id,
    adapterName: runtime.activeAdapter.name,
    runtimeVersion: SDK_VERSION,
  })

  const emit = (event: PageEvent) => {
    if (disposed) return
    listeners.forEach((listener) => listener(event))
  }

  const learning = createLearningWatcher({
    document: doc,
    getScanner: () => runtime.scanner!,
    onInput: (field, value) => emit({ type: 'field-input', field, value }),
  })
  learning.start()

  const observer = createFieldObserver({
    document: doc,
    getRoots: () => runtime.scanner!.shadowRoots,
    ...(options.mutationDebounceMs !== undefined ? { debounceMs: options.mutationDebounceMs } : {}),
    onChange: () => {
      if (disposed || !lastRequest) return
      syncAdapter()
      const fields = runtime.scanner!.scan(lastRequest)
      observer.refresh()
      const signature = fieldsSignature(fields)
      if (signature === lastSignature) return
      lastSignature = signature
      emit({ type: 'fields-changed', frameId: null, fields })
    },
  })

  return {
    kind: 'dom',
    get scanner() {
      return runtime.scanner!
    },
    async connect() {
      syncAdapter()
      return pageInfo()
    },
    async scan(request, signal) {
      throwIfAborted(signal)
      syncAdapter()
      const normalized = scanRequestSchema.parse(request ?? {})
      const fields = runtime.scanner!.scan(normalized)
      lastRequest = normalized
      lastSignature = fieldsSignature(fields)
      if (options.observe !== false && !disposed) {
        observer.start()
        observer.refresh()
      }
      return { page: pageInfo(), fields, scannedAt: Date.now() }
    },
    async fill(operations, signal) {
      throwIfAborted(signal)
      learning.suppress(500)
      return actions.fill(operations, signal)
    },
    async clear(operations, signal) {
      throwIfAborted(signal)
      learning.suppress(500)
      return actions.clear(operations, signal)
    },
    async setLearningArmed(armed, signal) {
      throwIfAborted(signal)
      learning.setArmed(armed)
    },
    async restore(snapshotId, signal) {
      throwIfAborted(signal)
      return actions.restore(snapshotId, signal)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit,
    async dispose() {
      disposed = true
      learning.stop()
      observer.stop()
      listeners.clear()
    },
  }
}
