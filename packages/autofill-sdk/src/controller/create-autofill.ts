import {
  AutofillError,
  createEventBus,
  silentLogger,
  toAutofillError,
  type AutofillSettings,
  type FieldDescriptor,
  type FillOperationInput,
  type FillResult,
  type MatchResult,
  type PageInfo,
  type PolicyDecision,
  type RestoreResult,
} from '@ufa/core'
import { evaluatePolicies } from '@ufa/form-actions'
import {
  BUILTIN_STRATEGIES,
  catalogClassifier,
  classifyFields,
  createCustomFieldClassifier,
  matchFields,
} from '@ufa/matching-engine'
import { createAutofillStore, type StoreSnapshot } from '@ufa/storage'

import { createStore } from './store'
import type {
  AutofillConfiguration,
  AutofillController,
  AutofillState,
  FillRequest,
} from './types'

const INITIAL_STATE: AutofillState = {
  status: 'idle',
  page: null,
  error: null,
  fields: [],
  matches: {},
  decisions: {},
  results: {},
  scanning: false,
  filling: false,
  canUndo: false,
  scannedAt: null,
}

/** State of a page the controller no longer knows anything about. */
const NO_PAGE_DATA = {
  fields: [],
  matches: {},
  decisions: {},
  results: {},
  canUndo: false,
} satisfies Partial<AutofillState>

function compareFields(a: FieldDescriptor, b: FieldDescriptor): number {
  return (a.frameId ?? 0) - (b.frameId ?? 0) || a.order - b.order
}

/** The parts of the saved data that classification, matching and policies read. */
const matchInputs = (snapshot: StoreSnapshot) => [
  snapshot.status,
  snapshot.answers,
  snapshot.customFields,
  snapshot.mappings,
  snapshot.activeProfile?.id ?? null,
  snapshot.settings,
]

function skippedResult(fieldId: string, reason: string): FillResult {
  return { fieldId, status: 'skipped', reason, verified: false, snapshotId: null }
}

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
  /** Snapshot of the latest fill that changed something; the one `undo` restores. */
  let undoSnapshotId: string | null = null
  /** Page actions (fill, undo) run one after another. */
  let actionQueue: Promise<unknown> = Promise.resolve()
  let destroyed = false

  const onPluginError = (pluginId: string, error: unknown) =>
    logger.warn('plugin failed', { pluginId, message: toAutofillError(error).message })

  const decide = (
    field: FieldDescriptor,
    match: MatchResult,
    settings: AutofillSettings,
    site: string,
  ): PolicyDecision =>
    evaluatePolicies(
      { field, match, generated: null, settings, site },
      { policies: config.registry?.list('policy') ?? [], onPluginError },
    )

  /** Classifies the detected fields, matches them against the saved answers and applies policies. */
  const analyze = (
    fields: readonly FieldDescriptor[],
    page: PageInfo | null,
  ): Pick<AutofillState, 'fields' | 'matches' | 'decisions'> => {
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
      return { fields: classified, matches: {}, decisions: {} }
    const site = page?.hostname ?? ''
    const results = matchFields(
      classified,
      {
        answers: snapshot.answers,
        mappings: snapshot.mappings,
        customFields: snapshot.customFields,
        activeProfileId: snapshot.activeProfile?.id ?? null,
        site,
        pageTitle: page?.title ?? null,
        thresholds: snapshot.settings.thresholds,
      },
      {
        strategies: [...BUILTIN_STRATEGIES, ...(config.registry?.list('matcher') ?? [])],
        onPluginError,
      },
    )
    const matches = Object.fromEntries(results.map((result) => [result.fieldId, result]))
    const decisions: Record<string, PolicyDecision> = {}
    for (const field of classified) {
      const match = matches[field.id]
      if (match) decisions[field.id] = decide(field, match, snapshot.settings, site)
    }
    return { fields: classified, matches, decisions }
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

  const forgetPage = () => {
    detected = []
    undoSnapshotId = null
  }

  const fail = (error: unknown, operation: string) => {
    const failure = toAutofillError(error)
    logger.warn(`${operation} failed`, { code: failure.code })
    const { site, reason } = failure.details ?? {}
    forgetPage()
    store.setState({
      status: 'error',
      page: null,
      ...NO_PAGE_DATA,
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

  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const run = actionQueue.then(action, action)
    actionQueue = run.catch(() => undefined)
    return run
  }

  const requireReady = () => {
    if (destroyed) throw destroyedError()
    if (store.getState().status !== 'ready')
      throw new AutofillError('CONTENT_UNAVAILABLE', 'Connect to a page first.')
  }

  /** Turns a request into page operations; everything refused is reported with its reason. */
  const planFill = (request: FillRequest) => {
    const state = store.getState()
    const { settings } = data.getSnapshot()
    const site = state.page?.hostname ?? ''
    const selected = request.fieldIds ? new Set(request.fieldIds) : null
    const operations: FillOperationInput[] = []
    const refused: FillResult[] = []
    const answerIds = new Map<string, string>()
    const known = new Set<string>()
    for (const field of state.fields) {
      known.add(field.id)
      const isSelected = selected?.has(field.id) ?? false
      if (selected && !isSelected) continue
      const match = state.matches[field.id]
      if (!match) {
        if (isSelected) refused.push(skippedResult(field.id, 'There is no answer to fill.'))
        continue
      }
      let effective = match
      const choice = request.choices?.[field.id]
      if (choice !== undefined) {
        const candidate = match.candidates.find(
          (entry) => entry.answerId === choice && entry.compatible && entry.fillValue,
        )
        if (!candidate) {
          if (isSelected)
            refused.push(skippedResult(field.id, 'That saved answer does not fit this field.'))
          continue
        }
        // The user's own pick: confirmable, but never filled without selection.
        effective = { ...match, state: 'suggested', best: candidate, reason: null }
      }
      const decision = decide(field, effective, settings, site)
      const allowed = isSelected
        ? decision.action === 'fill' || decision.action === 'confirm'
        : decision.action === 'fill'
      const value = effective.best?.fillValue
      if (!allowed || !effective.best || !value) {
        if (isSelected) refused.push(skippedResult(field.id, decision.reason))
        continue
      }
      operations.push({
        fieldId: field.id,
        fingerprint: field.fingerprint,
        value,
        allowOverwrite: settings.overwriteExisting,
        source: 'saved',
        explicitlySelected: isSelected,
      })
      answerIds.set(field.id, effective.best.answerId)
    }
    for (const fieldId of request.fieldIds ?? []) {
      if (!known.has(fieldId))
        refused.push(skippedResult(fieldId, 'The field is no longer on the page.'))
    }
    return { operations, refused, answerIds }
  }

  const fill = (request: FillRequest = {}): Promise<FillResult[]> =>
    enqueue(async () => {
      requireReady()
      const { operations, refused, answerIds } = planFill(request)
      store.setState({ filling: true })
      let filled: FillResult[]
      try {
        filled = operations.length > 0 ? await config.driver.fill(operations) : []
      } catch (error) {
        const failure = toAutofillError(error)
        if (!destroyed) {
          store.setState({ filling: false })
          events.emit({ type: 'error', code: failure.code, message: failure.message })
        }
        throw failure
      }
      if (destroyed) return []
      const order = new Map(store.getState().fields.map((field, index) => [field.id, index]))
      const results = [...filled, ...refused].sort(
        (a, b) => (order.get(a.fieldId) ?? Infinity) - (order.get(b.fieldId) ?? Infinity),
      )
      const snapshotId = filled.find((result) => result.snapshotId)?.snapshotId ?? null
      if (snapshotId) undoSnapshotId = snapshotId
      store.setState({
        filling: false,
        canUndo: undoSnapshotId !== null,
        results: {
          ...store.getState().results,
          ...Object.fromEntries(results.map((result) => [result.fieldId, result])),
        },
      })
      events.emit({ type: 'fill:complete', results })
      const used = [
        ...new Set(
          results.flatMap((result) => {
            const answerId = result.status === 'filled' ? answerIds.get(result.fieldId) : undefined
            return answerId ? [answerId] : []
          }),
        ),
      ]
      if (used.length > 0)
        await data.answers
          .recordUsage(used)
          .catch((error: unknown) =>
            logger.warn('recording answer usage failed', toAutofillError(error).message),
          )
      if (filled.length > 0) await runScan()
      return results
    })

  const undo = (): Promise<RestoreResult[]> =>
    enqueue(async () => {
      requireReady()
      const snapshotId = undoSnapshotId
      if (!snapshotId) return []
      undoSnapshotId = null
      store.setState({ filling: true, canUndo: false })
      let restored: RestoreResult[]
      try {
        restored = await config.driver.restore(snapshotId)
      } catch (error) {
        const failure = toAutofillError(error)
        if (!destroyed) {
          store.setState({ filling: false })
          events.emit({ type: 'error', code: failure.code, message: failure.message })
        }
        throw failure
      }
      if (destroyed) return []
      const results = { ...store.getState().results }
      for (const result of restored) if (result.status === 'restored') delete results[result.fieldId]
      store.setState({ filling: false, results })
      events.emit({ type: 'restore:complete', results: restored })
      if (restored.length > 0) await runScan()
      return restored
    })

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
        forgetPage()
        store.setState({ ...NO_PAGE_DATA, scannedAt: null })
        events.emit({ type: 'page:changed', url: event.url })
        void connect()
        break
      case 'disconnected':
        forgetPage()
        store.setState({ status: 'idle', page: null, ...NO_PAGE_DATA, scanning: false })
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
    fill,
    undo,
    async destroy() {
      if (destroyed) return
      destroyed = true
      stopDriverEvents()
      stopDataEvents()
      stopRematch()
      if (ownsData) data.dispose()
      events.clear()
      store.setState({ status: 'destroyed', scanning: false, filling: false })
      await config.driver.dispose()
    },
  }
}
