import { createExtensionAutofillHost, type ExtensionAutofillHost } from '@ufa/extension-bridge'

export const CONTENT_SCRIPT_FILE = 'content-script.js'
export const STORAGE_NAMESPACE = 'ufa'

/** A tab can be pinned with `?tabId=` (used when the panel is opened in its own tab). */
function pinnedTabId(): number | undefined {
  const raw = new URLSearchParams(location.search).get('tabId')
  const value = raw == null ? Number.NaN : Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

export function createHost(): ExtensionAutofillHost {
  return createExtensionAutofillHost({
    chrome,
    contentScriptFile: CONTENT_SCRIPT_FILE,
    storageNamespace: STORAGE_NAMESPACE,
    tabId: pinnedTabId(),
  })
}
