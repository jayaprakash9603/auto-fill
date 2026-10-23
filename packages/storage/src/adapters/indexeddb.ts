import { AutofillError, type StorageAdapter } from '@ufa/core'

export interface IndexedDbStorageOptions {
  /** Defaults to "universal-form-autofill". */
  databaseName?: string
  /** Object store holding the key-value pairs. Defaults to "kv". */
  storeName?: string
  /** Prefix for every key, so several products can share one database. */
  namespace?: string
  /** Defaults to `globalThis.indexedDB`. */
  indexedDB?: IDBFactory
  /**
   * BroadcastChannel used to tell other pages of the same origin about writes. Defaults to one per
   * database; `false` disables cross-page notifications.
   */
  channelName?: string | false
}

export interface IndexedDbStorage extends StorageAdapter {
  /** Closes the connection and the change channel. Later calls reopen the connection. */
  close(): void
}

const DATABASE_VERSION = 1

const storageError = (error: unknown, fallback: string) =>
  error instanceof AutofillError
    ? error
    : new AutofillError('STORAGE_ERROR', error instanceof Error ? error.message : fallback, {
        cause: error,
      })

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted.'))
  })
}

/**
 * Adapter over one IndexedDB object store. Nothing is opened until the first operation. `setMany`
 * and `remove` run in a single transaction, so they apply completely or not at all.
 */
export function createIndexedDbStorage(options: IndexedDbStorageOptions = {}): IndexedDbStorage {
  const databaseName = options.databaseName ?? 'universal-form-autofill'
  const storeName = options.storeName ?? 'kv'
  const prefix = options.namespace ? `${options.namespace}:` : ''
  const channelName =
    options.channelName === false ? null : (options.channelName ?? `ufa-storage:${databaseName}`)
  const full = (key: string) => `${prefix}${key}`
  const strip = (key: string) => key.slice(prefix.length)

  const listeners = new Set<(keys: string[]) => void>()
  let channel: BroadcastChannel | null = null
  let opening: Promise<IDBDatabase> | null = null

  const notify = (keys: string[]) => listeners.forEach((listener) => listener(keys))

  const ensureChannel = () => {
    if (channel || !channelName || typeof BroadcastChannel !== 'function') return channel
    channel = new BroadcastChannel(channelName)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { keys?: unknown } | null
      if (!data || !Array.isArray(data.keys)) return
      const keys = data.keys
        .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix))
        .map(strip)
      if (keys.length) notify(keys)
    }
    return channel
  }

  const announce = (fullKeys: string[]) => {
    notify(fullKeys.map(strip))
    ensureChannel()?.postMessage({ keys: fullKeys })
  }

  const open = (): Promise<IDBDatabase> => {
    if (opening) return opening
    const factory = options.indexedDB ?? globalThis.indexedDB
    if (!factory) {
      return Promise.reject(
        new AutofillError('STORAGE_ERROR', 'IndexedDB is not available in this context.'),
      )
    }
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName))
          request.result.createObjectStore(storeName)
      }
      request.onsuccess = () => {
        const database = request.result
        // Let a newer version of the extension upgrade the database instead of blocking it.
        database.onversionchange = () => {
          database.close()
          opening = null
        }
        resolve(database)
      }
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'))
    }).catch((error: unknown) => {
      opening = null
      throw storageError(error, 'Could not open IndexedDB.')
    })
    return opening
  }

  const read = async <T>(run: (store: IDBObjectStore) => Promise<T>): Promise<T> => {
    try {
      const database = await open()
      return await run(database.transaction(storeName, 'readonly').objectStore(storeName))
    } catch (error) {
      throw storageError(error, 'IndexedDB read failed.')
    }
  }

  const write = async (run: (store: IDBObjectStore) => void, fullKeys: string[]) => {
    try {
      const database = await open()
      const transaction = database.transaction(storeName, 'readwrite')
      const done = transactionDone(transaction)
      run(transaction.objectStore(storeName))
      await done
    } catch (error) {
      throw storageError(error, 'IndexedDB write failed.')
    }
    if (fullKeys.length) announce(fullKeys)
  }

  return {
    id: 'indexeddb',
    capabilities: {
      atomicBatch: true,
      changeEvents:
        channelName && typeof BroadcastChannel === 'function' ? 'cross-context' : 'local',
    },
    get<T>(key: string) {
      return read((store) => requestResult(store.get(full(key)) as IDBRequest<T | undefined>))
    },
    getMany(keys) {
      return read(async (store) => {
        const values = await Promise.all(keys.map((key) => requestResult(store.get(full(key)))))
        const out: Record<string, unknown> = {}
        keys.forEach((key, index) => {
          if (values[index] !== undefined) out[key] = values[index]
        })
        return out
      })
    },
    set(key, value) {
      return write((store) => store.put(value, full(key)), [full(key)])
    },
    setMany(entries) {
      const pairs = Object.entries(entries)
      return write(
        (store) => pairs.forEach(([key, value]) => store.put(value, full(key))),
        pairs.map(([key]) => full(key)),
      )
    },
    remove(keys) {
      const list = (typeof keys === 'string' ? [keys] : [...keys]).map(full)
      return write((store) => list.forEach((key) => store.delete(key)), list)
    },
    keys(keyPrefix = '') {
      const start = full(keyPrefix)
      return read(async (store) => {
        const all = await requestResult(store.getAllKeys())
        return all
          .filter((key): key is string => typeof key === 'string' && key.startsWith(start))
          .map(strip)
          .sort()
      })
    },
    subscribe(listener) {
      ensureChannel()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      channel?.close()
      channel = null
      const pending = opening
      opening = null
      void pending?.then((database) => database.close()).catch(() => undefined)
    },
  }
}
