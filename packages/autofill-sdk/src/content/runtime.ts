import { toAutofillError, type FieldDetector } from '@ufa/core'

import { createDomPageDriver, type DomPageDriver } from '../dom/dom-page-driver'
import {
  createEventEnvelope,
  errorResponse,
  isProtocolMessage,
  runtimeRequestSchema,
  type RuntimeEventEnvelope,
  type RuntimeRequest,
  type RuntimeResponse,
} from '../protocol/messages'
import { SDK_VERSION } from '../version'

/**
 * Transport between the injected runtime and the extension page. The extension bridge implements
 * it with `chrome.runtime`; tests and other hosts can supply their own.
 */
export interface RuntimeMessagePort {
  /** Registers a listener. Return a promise to answer a request, or undefined to ignore the message. */
  onMessage(listener: (message: unknown) => Promise<RuntimeResponse> | undefined): () => void
  emit(envelope: RuntimeEventEnvelope): void
  /** False once the transport is dead (for example after the extension was reloaded). */
  isConnected?(): boolean
}

export interface ContentRuntimeOptions {
  port: RuntimeMessagePort
  document?: Document
  window?: Window
  /** Field detectors for hosts that bundle their own content script; defaults to the built-ins. */
  detectors?: readonly FieldDetector[]
}

export interface ContentRuntimeHandle {
  readonly version: string
  readonly driver: DomPageDriver
  isConnected(): boolean
  dispose(): void
}

const GLOBAL_KEY = '__universalFormAutofillRuntime__'

type RuntimeGlobal = typeof globalThis & { [GLOBAL_KEY]?: ContentRuntimeHandle }

async function handleRequest(driver: DomPageDriver, request: RuntimeRequest): Promise<unknown> {
  switch (request.type) {
    case 'ping':
      return driver.connect()
    case 'scan':
      return driver.scan(request.request)
    case 'fill':
      return driver.fill(request.operations)
    case 'restore':
      return driver.restore(request.snapshotId)
  }
}

/**
 * Installs the page runtime once per document. Re-injection with the same version is a no-op;
 * a different version replaces the old runtime so the protocol always matches the extension.
 */
export function installAutofillContentRuntime(
  options: ContentRuntimeOptions,
): ContentRuntimeHandle {
  const scope = globalThis as RuntimeGlobal
  const existing = scope[GLOBAL_KEY]
  if (existing?.version === SDK_VERSION && existing.isConnected()) return existing
  existing?.dispose()

  const driver = createDomPageDriver({
    ...(options.document ? { document: options.document } : {}),
    ...(options.window ? { window: options.window } : {}),
    ...(options.detectors ? { detectors: options.detectors } : {}),
  })
  const stopEvents = driver.subscribe((event) => options.port.emit(createEventEnvelope(event)))

  const stopMessages = options.port.onMessage((message) => {
    if (!isProtocolMessage(message) || message.kind !== 'request') return undefined
    const parsed = runtimeRequestSchema.safeParse(message)
    if (!parsed.success)
      return Promise.resolve(errorResponse('PROTOCOL_ERROR', 'Malformed request.'))
    return handleRequest(driver, parsed.data).then(
      (data): RuntimeResponse => ({ ok: true, data }),
      (error: unknown) => {
        const failure = toAutofillError(error)
        return errorResponse(failure.code, failure.message)
      },
    )
  })

  const handle: ContentRuntimeHandle = {
    version: SDK_VERSION,
    driver,
    isConnected: () => options.port.isConnected?.() ?? true,
    dispose() {
      stopMessages()
      stopEvents()
      void driver.dispose()
      if (scope[GLOBAL_KEY] === handle) delete scope[GLOBAL_KEY]
    },
  }
  scope[GLOBAL_KEY] = handle
  return handle
}
