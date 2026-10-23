import { createAutofill, type AutofillController, type AutofillHost } from '@ufa/autofill-sdk'
import { AutofillError, type Logger, type StorageAdapter } from '@ufa/core'
import { createStorageAreaAdapter, type StorageAreaLike } from '@ufa/storage'

import type { ChromeLike } from './chrome-like'
import { createExtensionTabDriver, type ExtensionTabDriverOptions } from './tab-driver'
import { originPattern, resolveActiveWebTab } from './tabs'

export interface ExtensionAutofillHostOptions {
  chrome: ChromeLike
  /** Extension-relative path of the injectable runtime (copy it with the `ufa-assets` CLI). */
  contentScriptFile: string
  /** Prefix for every stored key, e.g. "browser_toolbox_autofill". */
  storageNamespace: string
  /** Defaults to `chrome.storage.local`. Pass any adapter to use IndexedDB or host storage instead. */
  storage?: StorageAdapter | StorageAreaLike
  tabId?: ExtensionTabDriverOptions['tabId']
  logger?: Logger
}

export interface ExtensionAutofillHost extends AutofillHost {
  /** Resolved lazily so creating the host never touches extension APIs. */
  getStorage(): StorageAdapter
  requestPageAccess(): Promise<boolean>
}

function isStorageAdapter(value: StorageAdapter | StorageAreaLike): value is StorageAdapter {
  return typeof (value as StorageAdapter).getMany === 'function'
}

/**
 * One-call setup for extension pages. The host extension keeps control of permissions and
 * capabilities; this only wires its `chrome` object into the headless engine.
 */
export function createExtensionAutofillHost(
  options: ExtensionAutofillHostOptions,
): ExtensionAutofillHost {
  let storage: StorageAdapter | null = null

  const getStorage = (): StorageAdapter => {
    if (storage) return storage
    const configured = options.storage
    if (configured && isStorageAdapter(configured)) {
      storage = configured
    } else {
      const area = configured ?? options.chrome.storage?.local
      if (!area)
        throw new AutofillError(
          'STORAGE_ERROR',
          'chrome.storage is unavailable; add the "storage" permission or pass a storage adapter.',
        )
      storage = createStorageAreaAdapter({
        area,
        namespace: options.storageNamespace,
        id: 'chrome-storage',
      })
    }
    return storage
  }

  return {
    getStorage,
    createController(): AutofillController {
      const driver = createExtensionTabDriver({
        chrome: options.chrome,
        contentScriptFile: options.contentScriptFile,
        tabId: options.tabId,
      })
      return createAutofill({ driver, storage: getStorage(), logger: options.logger })
    },
    async requestPageAccess() {
      if (!options.chrome.permissions) return false
      const tab = await resolveActiveWebTab(options.chrome)
      const origin = originPattern(tab?.url)
      if (!origin) return false
      if (await options.chrome.permissions.contains({ origins: [origin] })) return true
      return options.chrome.permissions.request({ origins: [origin] })
    },
  }
}
