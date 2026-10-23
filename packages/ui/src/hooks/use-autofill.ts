import type { AutofillController, AutofillHost, AutofillState } from '@ufa/autofill-sdk'
import { useEffect, useMemo, useSyncExternalStore } from 'react'

const DETACHED_STATE: AutofillState = { status: 'idle', page: null, error: null }
const noopSubscribe = () => () => {}
const getNull = () => null

export function useAutofillState(controller: AutofillController | null): AutofillState {
  return useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    controller ? controller.getState : () => DETACHED_STATE,
    controller ? controller.getState : () => DETACHED_STATE,
  )
}

/**
 * A controller that exists exactly while something is subscribed: created and connected on
 * subscribe, destroyed on unsubscribe. This keeps StrictMode's mount/unmount/mount cycle leak-free.
 */
function createOwnedController(host: AutofillHost) {
  let current: AutofillController | null = null
  return {
    get: () => current,
    subscribe(onChange: () => void) {
      const controller = host.createController()
      current = controller
      onChange()
      void controller.connect()
      return () => {
        if (current === controller) current = null
        void controller.destroy()
      }
    },
  }
}

/**
 * Owns a controller for the component's lifetime: created and connected on mount, destroyed on
 * unmount. A controller passed in directly is used as-is and never destroyed here.
 */
export function useAutofillController(
  host: AutofillHost | undefined,
  external?: AutofillController,
): AutofillController | null {
  const owned = useMemo(
    () => (host && !external ? createOwnedController(host) : null),
    [host, external],
  )
  const controller = useSyncExternalStore(
    owned ? owned.subscribe : noopSubscribe,
    owned ? owned.get : getNull,
    getNull,
  )

  useEffect(() => {
    if (external && external.getState().status === 'idle') void external.connect()
  }, [external])

  return external ?? controller
}
