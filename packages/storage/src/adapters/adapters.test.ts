import type { StorageAdapter } from '@ufa/core'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import { createHostStorage, type HostStorageBackend } from './host'
import { createIndexedDbStorage } from './indexeddb'
import { createMemoryStorage } from './memory'
import { createStorageAreaAdapter, type StorageAreaLike } from './storage-area'

function fakeArea(): StorageAreaLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  const listeners = new Set<(changes: Record<string, unknown>) => void>()
  const emit = (keys: string[]) => {
    const changes = Object.fromEntries(keys.map((key) => [key, {}]))
    listeners.forEach((listener) => listener(changes))
  }
  return {
    data,
    async get(keys) {
      const list = keys == null ? [...data.keys()] : typeof keys === 'string' ? [keys] : keys
      return Object.fromEntries(
        list.filter((key) => data.has(key)).map((key) => [key, structuredClone(data.get(key))]),
      )
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value))
      emit(Object.keys(items))
    },
    async remove(keys) {
      const list = typeof keys === 'string' ? [keys] : keys
      list.forEach((key) => data.delete(key))
      emit(list)
    },
    onChanged: {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
    },
  }
}

function mapBackend(full: boolean): HostStorageBackend & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  const backend: HostStorageBackend & { data: Map<string, unknown> } = {
    data,
    get: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  }
  if (full) {
    backend.setMany = (entries) =>
      Object.entries(entries).forEach(([key, value]) => data.set(key, value))
    backend.keys = (prefix) => [...data.keys()].filter((key) => key.startsWith(prefix))
  }
  return backend
}

const adapters: Array<[string, () => StorageAdapter]> = [
  ['memory', () => createMemoryStorage()],
  ['storage area', () => createStorageAreaAdapter({ area: fakeArea(), namespace: 'test' })],
  [
    'IndexedDB',
    () =>
      createIndexedDbStorage({
        indexedDB: new IDBFactory(),
        namespace: 'test',
        channelName: false,
      }),
  ],
  ['host (minimal)', () => createHostStorage(mapBackend(false), { namespace: 'test' })],
  ['host (full)', () => createHostStorage(mapBackend(true), { namespace: 'test' })],
]

describe.each(adapters)('%s adapter', (_name, create) => {
  it('reads, writes, lists and removes keys', async () => {
    const storage = create()
    expect(await storage.get('missing')).toBeUndefined()
    await storage.set('profiles', [{ id: 'p1' }])
    await storage.setMany({
      answers: [{ id: 'a1' }],
      'answers:index': 1,
      settings: { mode: 'review' },
    })

    expect(await storage.get('profiles')).toEqual([{ id: 'p1' }])
    expect(await storage.getMany(['answers', 'settings', 'missing'])).toEqual({
      answers: [{ id: 'a1' }],
      settings: { mode: 'review' },
    })
    expect(await storage.keys()).toEqual(['answers', 'answers:index', 'profiles', 'settings'])
    expect(await storage.keys('answers')).toEqual(['answers', 'answers:index'])

    await storage.remove(['answers', 'answers:index'])
    await storage.remove('settings')
    expect(await storage.keys()).toEqual(['profiles'])
  })

  it('keeps stored values independent of the caller’s objects', async () => {
    const storage = create()
    const value = { list: [1, 2] }
    await storage.set('key', value)
    value.list.push(3)
    const read = await storage.get<{ list: number[] }>('key')
    expect(read).toEqual({ list: [1, 2] })
    read?.list.push(4)
    expect(await storage.get('key')).toEqual({ list: [1, 2] })
  })

  it('notifies subscribers about changed keys', async () => {
    const storage = create()
    const listener = vi.fn()
    const stop = storage.subscribe?.(listener)
    await storage.setMany({ a: 1, b: 2 })
    await storage.remove('a')
    expect(listener).toHaveBeenCalledWith(['a', 'b'])
    expect(listener).toHaveBeenCalledWith(['a'])
    stop?.()
    await storage.set('c', 3)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('namespacing', () => {
  it('keeps products sharing one storage area apart', async () => {
    const area = fakeArea()
    const first = createStorageAreaAdapter({ area, namespace: 'toolbox' })
    const second = createStorageAreaAdapter({ area, namespace: 'other' })
    await first.set('profiles', ['mine'])
    await second.set('profiles', ['theirs'])
    expect(await first.get('profiles')).toEqual(['mine'])
    expect(await second.keys()).toEqual(['profiles'])
    expect([...area.data.keys()].sort()).toEqual(['other:profiles', 'toolbox:profiles'])
  })

  it('shares one IndexedDB database between namespaces', async () => {
    const indexedDB = new IDBFactory()
    const first = createIndexedDbStorage({ indexedDB, namespace: 'a', channelName: false })
    const second = createIndexedDbStorage({ indexedDB, namespace: 'b', channelName: false })
    await first.set('k', 1)
    await second.set('k', 2)
    expect(await first.get('k')).toBe(1)
    expect(await second.keys()).toEqual(['k'])
    first.close()
    second.close()
  })
})

describe('IndexedDB adapter', () => {
  it('persists across connections', async () => {
    const indexedDB = new IDBFactory()
    const first = createIndexedDbStorage({ indexedDB, channelName: false })
    await first.setMany({ profiles: ['p'], answers: ['a'] })
    first.close()
    const second = createIndexedDbStorage({ indexedDB, channelName: false })
    expect(await second.getMany(['profiles', 'answers'])).toEqual({
      profiles: ['p'],
      answers: ['a'],
    })
  })

  it('opens nothing until used', () => {
    const open = vi.fn()
    createIndexedDbStorage({ indexedDB: { open } as unknown as IDBFactory })
    expect(open).not.toHaveBeenCalled()
  })

  it('reports a missing IndexedDB as a storage error', async () => {
    expect(globalThis.indexedDB).toBeUndefined()
    await expect(createIndexedDbStorage().get('x')).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
  })
})

describe('host adapter', () => {
  it('keeps its own key index when the backend cannot list keys', async () => {
    const backend = mapBackend(false)
    const storage = createHostStorage(backend, { namespace: 'ns' })
    await storage.setMany({ x: 1, y: 2 })
    await storage.remove('x')
    expect(await storage.keys()).toEqual(['y'])
    expect(backend.data.get('ns:__ufa_index')).toEqual(['y'])
    expect(storage.capabilities).toEqual({ atomicBatch: false, changeEvents: 'local' })
  })

  it('reports backend failures as storage errors', async () => {
    const storage = createHostStorage({
      get: () => {
        throw new Error('quota exceeded')
      },
      set: () => undefined,
      remove: () => undefined,
    })
    await expect(storage.get('k')).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
      message: 'quota exceeded',
    })
  })
})
