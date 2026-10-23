import {
  AutofillError,
  createEventBus,
  silentLogger,
  toAutofillError,
  type FieldDescriptor,
  type MatchResult,
  type PageInfo,
} from '@ufa/core'
import {
  BUILTIN_STRATEGIES,
  catalogClassifier,
  classifyFields,
  createCustomFieldClassifier,
  matchFields,
} from '@ufa/matching-engine'
import { createAutofillStore, type StoreSnapshot } from '@ufa/storage'

import { createStore } from './store'
import type { AutofillConfiguration, AutofillController, AutofillState } from './types'

const INITIAL_STATE: AutofillState = {
  status: 'idle',
  page: null,
  error: null,
  fields: [],
  matches: {},
  scanning: false,
  scannedAt: null,
}

function compareFields(a: FieldDescriptor, b: FieldDescriptor): number {
  return (a.frameId ?? 0) - (b.frameId ?? 0) || a.order - b.order
}

/** The parts of the saved data that classification and matching read. */
const matchInputs = (snapshot: StoreSnapshot) => [
  snapshot.status,
  snapshot.answers,
  snapshot.customFields,
  snapshot.mappings,
  snapshot.activeProfile?.id ?? null,
  snapshot.settings.thresholds,
]

function countStates(matches: Record<string, MatchResult>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const result of Object.values(matches))
    counts[result.state] = (counts[result.state] ?? 0) + 1
  return counts
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
  /** Fields as the driver reported them, before classification. */
  let detected: FieldDescriptor[] = []
  let lastInputs: unknown[] = []
  let destroyed = false

  const onPluginError = (pluginId: string, error: unknown) =>
    logger.warn('plugin failed', { pluginId, message: toAutofillError(error).message })

  /** Classifies the detected fields and matches them against the saved answers. */
  const analyze = (
    fields: readonly FieldDescriptor[],
    page: PageInfo | null,
  ): Pick<AutofillState, 'fields' | 'matches'> => {
    const snapshot = data.getSnapshot()
    lastInputs = matchInputs(snapshot)
    const classified = classifyFields(fields, {
      classifiers: [
        ...(config.registry?.list('classifier') ?? []),
        createCustomFieldClassifier(snapshot.customFields),
        catalogClassifier,
      ],
      onPluginError,
    })
    if (snapshot.status !== 'ready' || classified.length === 0)
      return { fields: classified, matches: {} }
    const results = matchFields(
      classified,
      {
        answers: snapshot.answers,
        mappings: snapshot.mappings,
        customFields: snapshot.customFields,
        activeProfileId: snapshot.activeProfile?.id ?? null,
        site: page?.hostname ?? '',
        pageTitle: page?.title ?? null,
        thresholds: snapshot.settings.thresholds,
      },
      {
        strategies: [...BUILTIN_STRATEGIES, ...(config.registry?.list('matcher') ?? [])],
        onPluginError,
      },
    )
    return {
      fields: classified,
      matches: Object.fromEntries(results.map((result) => [result.fieldId, result])),
    }
  }

  /** Publishes new detected fields (or the current ones against changed data). */
  const publish = (fields: FieldDescriptor[], extra: Partial<AutofillState> = {}) => {
    detected = fields
    const page = extra.page !== undefined ? extra.page : store.getState().page
    const analyzed = analyze(fields, page)
    store.setState({ ...extra, ...analyzed })
    if (fields.length > 0)
      events.emit({ type: 'match:complete', counts: countStates(analyzed.matches) })
  }

  const stopRematch = data.subscribe(() => {
    if (destroyed || detected.length === 0) return
    const inputs = matchInputs(data.getSnapshot())
    if (inputs.every((value, index) => value === lastInputs[index])) return
    publish(detected)
  })

  const destroyedError = () =>
    new AutofillError('DESTROYED', 'This autofill controller was destroyed.')

  const fail = (error: unknown, operation: string) => {
    const failure = toAutofillError(error)
    logger.warn(`${operation} failed`, { code: failure.code })
    const { site, reason } = failure.details ?? {}
    detected = []
    store.setState({
      status: 'error',
      page: null,
      fields: [],
      matches: {},
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
        const newer = detected.filter((field) => updatedFrames.has(field.frameId))
        const fields = [
          ...result.fields.filter((field) => !updatedFrames.has(field.frameId)),
          ...newer,
        ].sort(compareFields)
        publish(fields, { page: result.page, scanning: false, scannedAt: result.scannedAt })
        events.emit({
          type: 'scan:complete',
          page: result.page,
          fieldCount: fields.length,
          durationMs: Math.max(0, now() - startedAt),
        })
        return store.getState().fields
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
          ...detected.filter((field) => field.frameId !== event.frameId),
          ...event.fields,
        ].sort(compareFields)
        publish(fields, { scannedAt: now() })
        events.emit({ type: 'fields:changed', fieldCount: fields.length })
        break
      }
      case 'navigated':
        detected = []
        store.setState({ fields: [], matches: {}, scannedAt: null })
        events.emit({ type: 'page:changed', url: event.url })
        void connect()
        break
      case 'disconnected':
        detected = []
        store.setState({ status: 'idle', page: null, fields: [], matches: {}, scanning: false })
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
      stopRematch()
      if (ownsData) data.dispose()
      events.clear()
      store.setState({ status: 'destroyed', scanning: false })
      await config.driver.dispose()
    },
  }
}
