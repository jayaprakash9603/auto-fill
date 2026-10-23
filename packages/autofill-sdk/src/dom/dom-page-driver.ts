import {
  scanRequestSchema,
  siteFromUrl,
  throwIfAborted,
  type FieldDetector,
  type PageDriver,
  type PageEvent,
  type PageInfo,
  type ScanRequest,
} from '@ufa/core'
import {
  createFieldObserver,
  createFieldScanner,
  fieldsSignature,
  type FieldScanner,
} from '@ufa/field-detection'

import { SDK_VERSION } from '../version'

export interface DomPageDriverOptions {
  document?: Document
  window?: Window
  /** Field detectors; defaults to the built-in generic detectors. */
  detectors?: readonly FieldDetector[]
  /** Watch the page after the first scan and emit `fields-changed`. Defaults to true. */
  observe?: boolean
  /** Quiet period before a burst of DOM mutations triggers a rescan. */
  mutationDebounceMs?: number
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
  const scanner = createFieldScanner({
    document: doc,
    ...(options.detectors ? { detectors: options.detectors } : {}),
    ...(options.onPluginError ? { onPluginError: options.onPluginError } : {}),
  })
  let lastRequest: ScanRequest | null = null
  let lastSignature = ''
  let disposed = false

  const pageInfo = (): PageInfo => ({
    url: win.location.href,
    title: doc.title,
    hostname: siteFromUrl(win.location.href) || win.location.hostname,
    frameCount: 1,
    adapterId: 'generic',
    adapterName: 'Generic form',
    runtimeVersion: SDK_VERSION,
  })

  const emit = (event: PageEvent) => {
    if (disposed) return
    listeners.forEach((listener) => listener(event))
  }

  const observer = createFieldObserver({
    document: doc,
    getRoots: () => scanner.shadowRoots,
    ...(options.mutationDebounceMs !== undefined ? { debounceMs: options.mutationDebounceMs } : {}),
    onChange: () => {
      if (disposed || !lastRequest) return
      const fields = scanner.scan(lastRequest)
      observer.refresh()
      const signature = fieldsSignature(fields)
      if (signature === lastSignature) return
      lastSignature = signature
      emit({ type: 'fields-changed', frameId: null, fields })
    },
  })

  return {
    kind: 'dom',
    scanner,
    async connect() {
      return pageInfo()
    },
    async scan(request, signal) {
      throwIfAborted(signal)
      const normalized = scanRequestSchema.parse(request ?? {})
      const fields = scanner.scan(normalized)
      lastRequest = normalized
      lastSignature = fieldsSignature(fields)
      if (options.observe !== false && !disposed) {
        observer.start()
        observer.refresh()
      }
      return { page: pageInfo(), fields, scannedAt: Date.now() }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit,
    async dispose() {
      disposed = true
      observer.stop()
      listeners.clear()
    },
  }
}
