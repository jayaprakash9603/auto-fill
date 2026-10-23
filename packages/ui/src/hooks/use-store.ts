import { createDefaultSettings, toAutofillError } from '@ufa/core'
import type { AutofillStore, StoreSnapshot } from '@ufa/storage'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

const DETACHED: StoreSnapshot = {
  status: 'idle',
  profiles: [],
  answers: [],
  customFields: [],
  mappings: [],
  settings: createDefaultSettings(),
  activeProfile: null,
  issues: [],
  error: null,
}
const noopSubscribe = () => () => {}

/** The store's current data, loading it on first use. */
export function useStoreSnapshot(store: AutofillStore | null | undefined): StoreSnapshot {
  useEffect(() => {
    void store?.ready()
  }, [store])
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : () => DETACHED,
    store ? store.getSnapshot : () => DETACHED,
  )
}

export interface ActionState {
  pending: boolean
  error: string | null
}

/**
 * Runs an async store operation and keeps its pending state and error message for display.
 * Resolves to the operation's result, or `undefined` when it failed.
 */
export function useAction() {
  const [state, setState] = useState<ActionState>({ pending: false, error: null })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const run = useCallback(async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
    setState({ pending: true, error: null })
    try {
      const result = await operation()
      if (mounted.current) setState({ pending: false, error: null })
      return result
    } catch (error) {
      if (mounted.current) setState({ pending: false, error: toAutofillError(error).message })
      return undefined
    }
  }, [])
  const reset = useCallback(() => setState({ pending: false, error: null }), [])
  return { ...state, run, reset }
}
