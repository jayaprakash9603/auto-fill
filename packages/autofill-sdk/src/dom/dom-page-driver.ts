import { siteFromUrl, type PageDriver, type PageEvent, type PageInfo } from '@ufa/core'

import { SDK_VERSION } from '../version'

export interface DomPageDriverOptions {
  document?: Document
  window?: Window
}

export interface DomPageDriver extends PageDriver {
  readonly kind: 'dom'
  /** Emits an event to subscribers; used by the content runtime to forward page activity. */
  emit(event: PageEvent): void
}

/** Operates on a live document directly: inside a content script, a web app, or a test. */
export function createDomPageDriver(options: DomPageDriverOptions = {}): DomPageDriver {
  const doc = options.document ?? document
  const win = options.window ?? doc.defaultView ?? window
  const listeners = new Set<(event: PageEvent) => void>()
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

  return {
    kind: 'dom',
    async connect() {
      return pageInfo()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(event) {
      if (disposed) return
      listeners.forEach((listener) => listener(event))
    },
    async dispose() {
      disposed = true
      listeners.clear()
    },
  }
}
