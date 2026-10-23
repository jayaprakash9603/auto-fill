import type { StorageAdapter } from '@ufa/core'

function clone<T>(value: T): T {
  return value === undefined ? value : (structuredClone(value) as T)
}

/** In-memory adapter for tests, demos and ephemeral sessions. Values are cloned on read and write. */
export function createMemoryStorage(
  initial: Record<string, unknown> = {},
): StorageAdapter & { snapshot(): Record<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(clone(initial)))
  const listeners = new Set<(keys: string[]) => void>()
  const notify = (keys: string[]) => listeners.forEach((listener) => listener(keys))

  return {
    id: 'memory',
    capabilities: { atomicBatch: true, changeEvents: 'local' },
    async get<T>(key: string) {
      return clone(data.get(key)) as T | undefined
    },
    async getMany(keys) {
      const out: Record<string, unknown> = {}
      for (const key of keys) if (data.has(key)) out[key] = clone(data.get(key))
      return out
    },
    async set(key, value) {
      data.set(key, clone(value))
      notify([key])
    },
    async setMany(entries) {
      const copy = clone(entries)
      for (const [key, value] of Object.entries(copy)) data.set(key, value)
      notify(Object.keys(copy))
    },
    async remove(keys) {
      const list = typeof keys === 'string' ? [keys] : [...keys]
      list.forEach((key) => data.delete(key))
      notify(list)
    },
    async keys(prefix = '') {
      return [...data.keys()].filter((key) => key.startsWith(prefix)).sort()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot() {
      return Object.fromEntries([...data.entries()].map(([key, value]) => [key, clone(value)]))
    },
  }
}
