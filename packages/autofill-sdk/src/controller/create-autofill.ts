import {
  AutofillError,
  createEventBus,
  silentLogger,
  toAutofillError,
  type FieldDescriptor,
  type PageInfo,
} from '@ufa/core'
import { createAutofillStore } from '@ufa/storage'

import { createStore } from './store'
import type { AutofillConfiguration, AutofillController, AutofillState } from './types'

const INITIAL_STATE: AutofillState = {
  status: 'idle',
  page: null,
  error: null,
  fields: [],
  scanning: false,
  scannedAt: null,
}

function compareFields(a: FieldDescriptor, b: FieldDescriptor): number {
  return (a.frameId ?? 0) - (b.frameId ?? 0) || a.order - b.order
}

/**
 * Creates a headless autofill controller. It has no import-time side effects and never touches
 * browser extension APIs; everything environment-specific is injected through the configuration.
 */
export function createAutofill(config: AutofillConfiguration): AutofillController {
  const logger = config.logger ?? silentLogger
  const now = config.now ?? Date.now
  const store = createStore<AutofillState>(INITIAL_STATE)
  const events = createEventBus((error) => logger.warn('event handler failed', error))
  const ownsData = !config.store
  const data = config.store ?? createAutofillStore({ adapter: config.storage, now, logger })
  const stopDataEvents = data.onChange((change) => {
    for (const collection of change.collections) events.emit({ type: 'data:changed', collection })
    if (change.activeProfileChanged)
      events.emit({
        type: 'profile:changed',
        profileId: data.getSnapshot().activeProfile?.id ?? null,
      })
  })
  let pendingConnect: Promise<PageInfo | null> | null = null
  let pendingScan: Promise<FieldDescriptor[]> | null = null
  /** Frames that reported their fields while a scan was in flight; those reports are newer. */
  let framesUpdatedDuringScan: Set<number | null> | null = null
  let destroyed = false

  const destroyedError = () =>
    new AutofillError('DESTROYED', 'This autofill controller was destroyed.')

  const fail = (error: unknown, operation: string) => {
    const failure = toAutofillError(error)
    logger.warn(`${operation} failed`, { code: failure.code })
    const { site, reason } = failure.details ?? {}
    store.setState({
      status: 'error',
      page: null,
      fields: [],
      scanning: false,
      error: {
        code: failure.code,
        message: failure.message,
        ...(typeof site === 'string' ? { site } : {}),
        ...(typeof reason === 'string' ? { reason } : {}),
      },
    })
    events.emit({ type: 'error', code: failure.code, message: failure.message })
  }

  const runScan = (): Promise<FieldDescriptor[]> => {
    if (pendingScan) return pendingScan
    const startedAt = now()
    const updatedFrames = new Set<number | null>()
    framesUpdatedDuringScan = updatedFrames
    store.setState({ scanning: true })
    events.emit({ type: 'scan:start' })
    pendingScan = config.driver
      .scan()
      .then((result) => {
        if (destroyed || store.getState().status !== 'ready') return []
        const newer = store.getState().fields.filter((field) => updatedFrames.has(field.frameId))
        const fields = [
          ...result.fields.filter((field) => !updatedFrames.has(field.frameId)),
          ...newer,
        ].sort(compareFields)
        store.setState({ fields, page: result.page, scanning: false, scannedAt: result.scannedAt })
        events.emit({
          type: 'scan:complete',
          page: result.page,
          fieldCount: fields.length,
          durationMs: Math.max(0, now() - startedAt),
        })
        return fields
      })
      .catch((error: unknown) => {
        if (!destroyed) fail(error, 'scan')
        return []
      })
      .finally(() => {
        pendingScan = null
        framesUpdatedDuringScan = null
      })
    return pendingScan
  }

  const connect = (): Promise<PageInfo | null> => {
    if (destroyed) return Promise.reject(destroyedError())
    if (pendingConnect) return pendingConnect
    void data.ready()
    store.setState({ status: 'connecting', error: null })
    pendingConnect = config.driver
      .connect()
      .then(async (page) => {
        if (destroyed) return null
        store.setState({ status: 'ready', page, error: null })
        events.emit({ type: 'connected', page })
        await runScan()
        const state = store.getState()
        return state.status === 'ready' ? state.page : null
      })
      .catch((error: unknown) => {
        if (!destroyed) fail(error, 'connect')
        return null
      })
      .finally(() => {
        pendingConnect = null
      })
    return pendingConnect
  }

  const scan = async (): Promise<FieldDescriptor[]> => {
    if (destroyed) throw destroyedError()
    if (pendingConnect || store.getState().status !== 'ready') {
      await connect()
      return store.getState().fields
    }
    return runScan()
  }

  const stopDriverEvents = config.driver.subscribe((event) => {
    if (destroyed) return
    switch (event.type) {
      case 'fields-changed': {
        if (store.getState().status !== 'ready') return
        framesUpdatedDuringScan?.add(event.frameId)
        const fields = [
          ...store.getState().fields.filter((field) => field.frameId !== event.frameId),
          ...event.fields,
        ].sort(compareFields)
        store.setState({ fields, scannedAt: now() })
        events.emit({ type: 'fields:changed', fieldCount: fields.length })
        break
      }
      case 'navigated':
        store.setState({ fields: [], scannedAt: null })
        events.emit({ type: 'page:changed', url: event.url })
        void connect()
        break
      case 'disconnected':
        store.setState({ status: 'idle', page: null, fields: [], scanning: false })
        break
      case 'field-input':
        break
    }
  })

  return {
    store: data,
    getState: store.getState,
    subscribe: store.subscribe,
    on: events.on,
    connect,
    scan,
    async destroy() {
      if (destroyed) return
      destroyed = true
      stopDriverEvents()
      stopDataEvents()
      if (ownsData) data.dispose()
      events.clear()
      store.setState({ status: 'destroyed', scanning: false })
      await config.driver.dispose()
    },
  }
}
