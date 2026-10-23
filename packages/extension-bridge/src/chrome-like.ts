import type { StorageAreaLike } from '@ufa/storage'

/**
 * Structural subset of the Chrome extension APIs the bridge uses. Hosts pass their real `chrome`
 * object; tests pass fakes. Nothing here reads the `chrome` global.
 *
 * Optional properties on values Chrome hands back spell out `| undefined` so the real `chrome`
 * stays assignable in hosts that enable `exactOptionalPropertyTypes`.
 */
export interface ChromeEventLike<Listener> {
  addListener(listener: Listener): void
  removeListener(listener: Listener): void
}

export interface TabLike {
  id?: number | undefined
  url?: string | undefined
  title?: string | undefined
  active?: boolean | undefined
  windowId?: number | undefined
  lastAccessed?: number | undefined
}

export interface MessageSenderLike {
  id?: string | undefined
  tab?: { id?: number | undefined } | undefined
  frameId?: number | undefined
}

export interface InjectionResultLike {
  frameId: number
}

/** Either every frame, or an explicit frame list; Chrome rejects both at once. */
export type InjectionTargetLike =
  | { tabId: number; allFrames: true; frameIds?: undefined }
  | { tabId: number; allFrames?: false; frameIds: number[] }

export interface ChromeLike {
  runtime: {
    id?: string | undefined
    sendMessage(message: unknown): Promise<unknown>
    onMessage: ChromeEventLike<
      (
        message: unknown,
        sender: MessageSenderLike,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void
    >
  }
  tabs: {
    query(queryInfo: {
      active?: boolean
      lastFocusedWindow?: boolean
      currentWindow?: boolean
      url?: string | string[]
    }): Promise<TabLike[]>
    get(tabId: number): Promise<TabLike>
    sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>
    onActivated?: ChromeEventLike<(info: { tabId: number; windowId: number }) => void> | undefined
    onUpdated?:
      | ChromeEventLike<
          (
            tabId: number,
            changeInfo: { status?: string | undefined; url?: string | undefined },
            tab: TabLike,
          ) => void
        >
      | undefined
    onRemoved?:
      | ChromeEventLike<
          (tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void
        >
      | undefined
  }
  scripting: {
    executeScript(injection: {
      target: InjectionTargetLike
      files: string[]
    }): Promise<InjectionResultLike[]>
  }
  windows?:
    | {
        getLastFocused(queryOptions?: {
          populate?: boolean
          windowTypes?: ('normal' | 'popup' | 'panel' | 'app' | 'devtools')[]
        }): Promise<{ id?: number | undefined; tabs?: TabLike[] | undefined }>
      }
    | undefined
  permissions?:
    | {
        contains(permissions: { origins?: string[] }): Promise<boolean>
        request(permissions: { origins?: string[] }): Promise<boolean>
      }
    | undefined
  storage?:
    | {
        local: StorageAreaLike
        session?: StorageAreaLike | undefined
      }
    | undefined
}
