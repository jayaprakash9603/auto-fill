import { AutofillError, type StorageAdapter } from '@ufa/core'

type MaybePromise<T> = T | Promise<T>

/**
 * The minimum a host must provide to keep autofill data in its own storage. The optional methods
 * make the adapter faster (`getMany`), atomic (`setMany`) or live (`subscribe`).
 */
export interface HostStorageBackend {
  get(key: string): MaybePromise<unknown>
  set(key: string, value: unknown): MaybePromise<void>
  remove(key: string): MaybePromise<void>
  getMany?(keys: string[]): MaybePromise<Record<string, unknown>>
  /** Should write all entries or none. Without it, entries are written one by one. */
  setMany?(entries: Record<string, unknown>): MaybePromise<void>
  /** Every stored key starting with `prefix`. Without it, the adapter keeps its own key index. */
  keys?(prefix: string): MaybePromise<string[]>
  subscribe?(listener: (keys: string[]) => void): () => void
}

export interface HostStorageOptions {
  /** Prefix for every key. */
  namespace?: string
  id?: string
}

const INDEX_KEY = '__ufa_index'

function clone<T>(value: T): T {
  return value === undefined ? value : (structuredClone(value) as T)
}

async function guard<T>(operation: () => MaybePromise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AutofillError) throw error
    throw new AutofillError(
      'STORAGE_ERROR',
      error instanceof Error ? error.message : 'Host storage failed.',
      { cause: error },
    )
  }
}

/**
 * Wraps a host-provided backend (a database, a sync service, a settings store) in a full
 * `StorageAdapter`. Values are cloned in both directions so neither side can mutate the other's
 * copy.
 */
export function createHostStorage(
  backend: HostStorageBackend,
  options: HostStorageOptions = {},
): StorageAdapter {
  const prefix = options.namespace ? `${options.namespace}:` : ''
  const full = (key: string) => `${prefix}${key}`
  const strip = (key: string) => key.slice(prefix.length)
  const indexKey = full(INDEX_KEY)
  const localListeners = new Set<(keys: string[]) => void>()

  const readIndex = async (): Promise<string[]> => {
    const raw = await backend.get(indexKey)
    return Array.isArray(raw) ? raw.filter((key): key is string => typeof key === 'string') : []
  }

  const updateIndex = async (add: string[], drop: string[]) => {
    if (backend.keys) return
    const index = new Set(await readIndex())
    add.forEach((key) => index.add(key))
    drop.forEach((key) => index.delete(key))
    await backend.set(indexKey, [...index].sort())
  }

  const notifyLocal = (keys: string[]) => {
    if (!backend.subscribe) localListeners.forEach((listener) => listener(keys))
  }

  const getMany = async (keys: readonly string[]) => {
    const out: Record<string, unknown> = {}
    if (backend.getMany) {
      const raw = await backend.getMany(keys.map(full))
      for (const key of keys) if (raw[full(key)] !== undefined) out[key] = clone(raw[full(key)])
      return out
    }
    const values = await Promise.all(keys.map((key) => backend.get(full(key))))
    keys.forEach((key, index) => {
      if (values[index] !== undefined) out[key] = clone(values[index])
    })
    return out
  }

  return {
    id: options.id ?? 'host',
    capabilities: {
      atomicBatch: Boolean(backend.setMany),
      changeEvents: backend.subscribe ? 'cross-context' : 'local',
    },
    get<T>(key: string) {
      return guard(async () => clone((await backend.get(full(key))) as T | undefined))
    },
    getMany(keys) {
      return guard(() => getMany(keys))
    },
    set(key, value) {
      return guard(async () => {
        await backend.set(full(key), clone(value))
        await updateIndex([key], [])
        notifyLocal([key])
      })
    },
    setMany(entries) {
      return guard(async () => {
        const copy = clone(entries)
        if (backend.setMany) {
          await backend.setMany(
            Object.fromEntries(Object.entries(copy).map(([key, value]) => [full(key), value])),
          )
        } else {
          for (const [key, value] of Object.entries(copy)) await backend.set(full(key), value)
        }
        await updateIndex(Object.keys(copy), [])
        notifyLocal(Object.keys(copy))
      })
    },
    remove(keys) {
      const list = typeof keys === 'string' ? [keys] : [...keys]
      return guard(async () => {
        for (const key of list) await backend.remove(full(key))
        await updateIndex([], list)
        notifyLocal(list)
      })
    },
    keys(keyPrefix = '') {
      return guard(async () => {
        const all = backend.keys
          ? (await backend.keys(full(keyPrefix))).filter((key) => key.startsWith(prefix)).map(strip)
          : await readIndex()
        return all.filter((key) => key !== INDEX_KEY && key.startsWith(keyPrefix)).sort()
      })
    },
    subscribe(listener) {
      if (backend.subscribe) {
        return backend.subscribe((keys) => {
          const own = keys.filter((key) => key.startsWith(prefix) && key !== indexKey).map(strip)
          if (own.length) listener(own)
        })
      }
      localListeners.add(listener)
      return () => localListeners.delete(listener)
    },
  }
}
