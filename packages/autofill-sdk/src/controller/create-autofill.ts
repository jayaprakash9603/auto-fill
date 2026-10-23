import {
  AutofillError,
  createEventBus,
  silentLogger,
  toAutofillError,
  type PageInfo,
} from '@ufa/core'

import { createStore } from './store'
import type { AutofillConfiguration, AutofillController, AutofillState } from './types'

const INITIAL_STATE: AutofillState = { status: 'idle', page: null, error: null }

/**
 * Creates a headless autofill controller. It has no import-time side effects and never touches
 * browser extension APIs; everything environment-specific is injected through the configuration.
 */
export function createAutofill(config: AutofillConfiguration): AutofillController {
  const logger = config.logger ?? silentLogger
  const store = createStore<AutofillState>(INITIAL_STATE)
  const events = createEventBus((error) => logger.warn('event handler failed', error))
  let pendingConnect: Promise<PageInfo | null> | null = null
  let destroyed = false

  const destroyedError = () =>
    new AutofillError('DESTROYED', 'This autofill controller was destroyed.')

  const connect = (): Promise<PageInfo | null> => {
    if (destroyed) return Promise.reject(destroyedError())
    if (pendingConnect) return pendingConnect
    store.setState({ status: 'connecting', error: null })
    pendingConnect = config.driver
      .connect()
      .then((page) => {
        if (destroyed) return null
        store.setState({ status: 'ready', page, error: null })
        events.emit({ type: 'connected', page })
        return page
      })
      .catch((error: unknown) => {
        if (destroyed) return null
        const failure = toAutofillError(error)
        logger.warn('connect failed', { code: failure.code })
        const { site, reason } = failure.details ?? {}
        store.setState({
          status: 'error',
          page: null,
          error: {
            code: failure.code,
            message: failure.message,
            ...(typeof site === 'string' ? { site } : {}),
            ...(typeof reason === 'string' ? { reason } : {}),
          },
        })
        events.emit({ type: 'error', code: failure.code, message: failure.message })
        return null
      })
      .finally(() => {
        pendingConnect = null
      })
    return pendingConnect
  }

  const stopDriverEvents = config.driver.subscribe((event) => {
    if (destroyed) return
    if (event.type === 'navigated') {
      events.emit({ type: 'page:changed', url: event.url })
      void connect()
    } else if (event.type === 'disconnected') {
      store.setState({ status: 'idle', page: null })
    }
  })

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    on: events.on,
    connect,
    async destroy() {
      if (destroyed) return
      destroyed = true
      stopDriverEvents()
      events.clear()
      store.setState({ status: 'destroyed' })
      await config.driver.dispose()
    },
  }
}
