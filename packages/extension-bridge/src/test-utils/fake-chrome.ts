import { installAutofillContentRuntime, type ContentRuntimeHandle } from '@ufa/autofill-sdk/content'
import { createMemoryStorage } from '@ufa/storage'

import type { ChromeLike, MessageSenderLike, TabLike } from '../chrome-like'

type Listener = (...args: never[]) => unknown

function createEvent<L extends Listener>() {
  const listeners = new Set<L>()
  return {
    addListener: (listener: L) => void listeners.add(listener),
    removeListener: (listener: L) => void listeners.delete(listener),
    fire: (...args: Parameters<L>) => listeners.forEach((listener) => listener(...args)),
    size: () => listeners.size,
  }
}

export interface FakeChromeOptions {
  tabs?: TabLike[]
  /** Error message thrown by executeScript, to simulate missing permissions. */
  injectError?: string
}

/**
 * In-process fake of the Chrome APIs the bridge uses. `executeScript` installs the real content
 * runtime in the current jsdom document, and `tabs.sendMessage` routes requests to it.
 */
export function createFakeChrome(options: FakeChromeOptions = {}) {
  const tabs = options.tabs ?? [
    { id: 7, url: 'https://jobs.example.com/apply', title: 'Apply', active: true, windowId: 1 },
  ]
  const onMessage =
    createEvent<
      (
        message: unknown,
        sender: MessageSenderLike,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void
    >()
  const contentListeners = new Set<(message: unknown) => Promise<unknown> | undefined>()
  const onUpdated =
    createEvent<(tabId: number, change: { status?: string; url?: string }, tab: TabLike) => void>()
  const onActivated = createEvent<(info: { tabId: number; windowId: number }) => void>()
  const onRemoved =
    createEvent<(tabId: number, info: { windowId: number; isWindowClosing: boolean }) => void>()
  let runtime: ContentRuntimeHandle | null = null
  const injections: unknown[] = []
  const storageArea = createMemoryStorage()

  const chrome: ChromeLike = {
    runtime: {
      id: 'fake-extension',
      sendMessage: async () => undefined,
      onMessage,
    },
    tabs: {
      query: async () => tabs.filter((tab) => tab.active),
      get: async (tabId) => {
        const tab = tabs.find((entry) => entry.id === tabId)
        if (!tab) throw new Error(`No tab with id ${tabId}`)
        return tab
      },
      sendMessage: async (_tabId, message) => {
        for (const listener of contentListeners) {
          const pending = listener(message)
          if (pending) return pending
        }
        throw new Error('Could not establish connection. Receiving end does not exist.')
      },
      onUpdated,
      onActivated,
      onRemoved,
    },
    scripting: {
      executeScript: async (injection) => {
        injections.push(injection)
        if (options.injectError) throw new Error(options.injectError)
        runtime ??= installAutofillContentRuntime({
          port: {
            onMessage(listener) {
              contentListeners.add(listener)
              return () => contentListeners.delete(listener)
            },
            emit(envelope) {
              const tabId = tabs.find((tab) => tab.active)?.id
              onMessage.fire(envelope, { tab: { id: tabId }, frameId: 0 }, () => undefined)
            },
          },
        })
        return [{ frameId: 0 }]
      },
    },
    windows: {
      getLastFocused: async () => ({ id: 1, tabs }),
    },
    permissions: {
      contains: async () => false,
      request: async () => true,
    },
    storage: {
      local: {
        get: async (keys) => {
          if (keys == null) return storageArea.snapshot()
          return storageArea.getMany(typeof keys === 'string' ? [keys] : keys)
        },
        set: (items) => storageArea.setMany(items),
        remove: (keys) => storageArea.remove(keys),
      },
    },
  }

  return {
    chrome,
    injections,
    events: { onMessage, onUpdated, onActivated, onRemoved },
    get runtime() {
      return runtime
    },
    cleanup() {
      runtime?.dispose()
      runtime = null
    },
  }
}
