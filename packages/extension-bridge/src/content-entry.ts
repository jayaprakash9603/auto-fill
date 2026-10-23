import {
  installAutofillContentRuntime,
  type ContentRuntimeHandle,
  type RuntimeMessagePort,
} from '@ufa/autofill-sdk/content'

function runtimeAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

/** Wires the page runtime to `chrome.runtime` messaging. Call from an injected content script. */
export function installExtensionContentRuntime(): ContentRuntimeHandle {
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
  return installAutofillContentRuntime({ port })
}
