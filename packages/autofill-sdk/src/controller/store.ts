export interface Store<S> {
  getState(): S
  setState(update: Partial<S> | ((state: S) => Partial<S>)): void
  subscribe(listener: (state: S) => void): () => void
}

/** Minimal immutable store compatible with React's useSyncExternalStore. */
export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial
  const listeners = new Set<(state: S) => void>()
  return {
    getState: () => state,
    setState(update) {
      const patch = typeof update === 'function' ? update(state) : update
      const keys = Object.keys(patch) as (keyof S)[]
      if (keys.every((key) => Object.is(state[key], patch[key]))) return
      state = { ...state, ...patch }
      listeners.forEach((listener) => listener(state))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
