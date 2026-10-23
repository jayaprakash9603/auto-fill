/**
 * Key-value persistence used by the repositories. Implementations exist for chrome.storage,
 * IndexedDB, memory, and host-provided backends. Values must be structured-cloneable JSON data.
 */
export interface StorageAdapter {
  readonly id: string
  get<T = unknown>(key: string): Promise<T | undefined>
  getMany(keys: readonly string[]): Promise<Record<string, unknown>>
  set<T>(key: string, value: T): Promise<void>
  /** Writes every entry in one operation; atomic where the backend supports transactions. */
  setMany(entries: Record<string, unknown>): Promise<void>
  remove(keys: string | readonly string[]): Promise<void>
  keys(prefix?: string): Promise<string[]>
  /** Optional change notifications (for example from another extension page). */
  subscribe?(listener: (changedKeys: string[]) => void): () => void
}
