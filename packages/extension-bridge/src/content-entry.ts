import {
  installAutofillContentRuntime,
  type ContentRuntimeHandle,
  type RuntimeMessagePort,
} from '@ufa/autofill-sdk/content'
import type { FieldDetector } from '@ufa/core'

function runtimeAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

export interface ExtensionContentRuntimeOptions {
  /** Field detectors to use instead of the built-ins, e.g. `[...BUILTIN_DETECTORS, mine]`. */
  detectors?: readonly FieldDetector[]
}

/** Wires the page runtime to `chrome.runtime` messaging. Call from an injected content script. */
export function installExtensionContentRuntime(
  options: ExtensionContentRuntimeOptions = {},
): ContentRuntimeHandle {
  const port: RuntimeMessagePort = {
    onMessage(listener) {
      const handler = (
        message: unknown,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => {
        const pending = listener(message)
        if (!pending) return false
        void pending.then(sendResponse)
        return true
      }
      chrome.runtime.onMessage.addListener(handler)
      return () => chrome.runtime.onMessage.removeListener(handler)
    },
    emit(envelope) {
      if (!runtimeAlive()) return
      chrome.runtime.sendMessage(envelope).catch(() => undefined)
    },
    isConnected: runtimeAlive,
  }
  return installAutofillContentRuntime({
    port,
    ...(options.detectors ? { detectors: options.detectors } : {}),
  })
}
