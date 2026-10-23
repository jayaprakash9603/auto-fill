import { AutofillError, type StorageAdapter } from '@ufa/core'

/** The subset of `chrome.storage.StorageArea` this adapter needs; the host injects the real object. */
export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
  onChanged?:
    | {
        addListener(listener: (changes: Record<string, unknown>) => void): void
        removeListener(listener: (changes: Record<string, unknown>) => void): void
      }
    | undefined
}

export interface StorageAreaAdapterOptions {
  area: StorageAreaLike
  /** Prefix for every key, so several products can share one storage area safely. */
  namespace: string
  id?: string
}

const wrap = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw new AutofillError(
      'STORAGE_ERROR',
      error instanceof Error ? error.message : 'Storage operation failed.',
      { cause: error },
    )
  }
}

/**
 * Adapter over a chrome.storage-compatible area (local, sync or session). Keys are namespaced;
 * `setMany` maps to a single `set` call, which chrome.storage applies atomically.
 */
export function createStorageAreaAdapter(options: StorageAreaAdapterOptions): StorageAdapter {
  const prefix = `${options.namespace}:`
  const full = (key: string) => `${prefix}${key}`
  const strip = (key: string) => key.slice(prefix.length)

  return {
    id: options.id ?? 'storage-area',
    get<T>(key: string) {
      return wrap(async () => (await options.area.get(full(key)))[full(key)] as T | undefined)
    },
    getMany(keys) {
      return wrap(async () => {
        const raw = await options.area.get(keys.map(full))
        const out: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(raw)) out[strip(key)] = value
        return out
      })
    },
    set(key, value) {
      return wrap(() => options.area.set({ [full(key)]: value }))
    },
    setMany(entries) {
      return wrap(() =>
        options.area.set(
          Object.fromEntries(Object.entries(entries).map(([key, value]) => [full(key), value])),
        ),
      )
    },
    remove(keys) {
      const list = typeof keys === 'string' ? [keys] : [...keys]
      return wrap(() => options.area.remove(list.map(full)))
    },
    keys(keyPrefix = '') {
      return wrap(async () =>
        Object.keys(await options.area.get(null))
          .filter((key) => key.startsWith(prefix))
          .map(strip)
          .filter((key) => key.startsWith(keyPrefix))
          .sort(),
      )
    },
    subscribe(listener) {
      const onChanged = options.area.onChanged
      if (!onChanged) return () => undefined
      const handler = (changes: Record<string, unknown>) => {
        const keys = Object.keys(changes)
          .filter((key) => key.startsWith(prefix))
          .map(strip)
        if (keys.length) listener(keys)
      }
      onChanged.addListener(handler)
      return () => onChanged.removeListener(handler)
    },
  }
}
