import {
  AutofillError,
  createEventBus,
  ensureExtensionSafeZod,
  silentLogger,
  toAutofillError,
  type AutofillSettings,
  type FieldDescriptor,
  type FillOperationInput,
  type FillResult,
  type MatchResult,
  type PageInfo,
  type ClearOperationInput,
  type ClearResult,
  type PolicyDecision,
  type RestoreResult,
  type SyntheticGenerationResult,
} from '@ufa/core'
import {
  buildLearningCandidate,
  fieldValueToAnswerValue,
  findDuplicateAnswerId,
  shouldCaptureLearning,
} from '@ufa/learning-engine'
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
import type { AnswerDraft } from '@ufa/storage'

import { BUILTIN_GENERATORS, generateForField } from '@ufa/synthetic-data'

import type {
  AutofillConfiguration,
  AutofillController,
  AutofillState,
  ClearRequest,
  FillRequest,
  GenerateRequest,
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
  learningArmed: false,
  learningCandidates: {},
  generated: {},
  clearResults: {},
}

/** State of a page the controller no longer knows anything about. */
const NO_PAGE_DATA = {
  fields: [],
  matches: {},
  decisions: {},
  results: {},
  canUndo: false,
  learningArmed: false,
  learningCandidates: {},
  generated: {},
  clearResults: {},
} satisfies Partial<AutofillState>

const emptyMatch = (fieldId: string): MatchResult => ({
  fieldId,
  state: 'missing',
  best: null,
  candidates: [],
  reason: null,
})

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

function skippedClear(fieldId: string, reason: string): ClearResult {
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
  ensureExtensionSafeZod()
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
    generated: SyntheticGenerationResult | null = null,
  ): PolicyDecision =>
    evaluatePolicies(
      { field, match, generated, settings, site },
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
    const generated = store.getState().generated
    const decisions: Record<string, PolicyDecision> = {}
    for (const field of classified) {
      const match = matches[field.id] ?? emptyMatch(field.id)
      decisions[field.id] = decide(
        field,
        match,
        snapshot.settings,
        site,
        generated[field.id] ?? null,
      )
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
    store.setState({
      learningArmed: false,
      learningCandidates: {},
      generated: {},
      clearResults: {},
    })
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
      const generated = state.generated[field.id]
      if (generated) {
        const match = state.matches[field.id] ?? emptyMatch(field.id)
        const decision = decide(field, match, settings, site, generated)
        const allowed = isSelected
          ? decision.action === 'fill' || decision.action === 'confirm'
          : decision.action === 'fill'
        if (allowed) {
          operations.push({
            fieldId: field.id,
            fingerprint: field.fingerprint,
            value: generated.value,
            allowOverwrite: settings.overwriteExisting,
            source: 'generated',
            explicitlySelected: isSelected,
          })
          continue
        }
        if (isSelected) refused.push(skippedResult(field.id, decision.reason))
        continue
      }
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
      const decision = decide(field, effective, settings, site, null)
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

  const planClear = (request: ClearRequest) => {
    const state = store.getState()
    const { settings } = data.getSnapshot()
    const selected = request.fieldIds ? new Set(request.fieldIds) : null
    const operations: ClearOperationInput[] = []
    const refused: ClearResult[] = []
    const known = new Set<string>()
    for (const field of state.fields) {
      known.add(field.id)
      const isSelected = selected?.has(field.id) ?? false
      if (selected && !isSelected) continue
      if (!field.hasValue) {
        if (isSelected) refused.push(skippedClear(field.id, 'The field is already empty.'))
        continue
      }
      if (field.sensitivity === 'prohibited' || field.support === 'unsupported') {
        if (isSelected) refused.push(skippedClear(field.id, 'This field cannot be cleared.'))
        continue
      }
      if (field.sensitivity === 'consent' && !isSelected) continue
      if (field.type === 'select' && !settings.clear.includeSelects) {
        if (isSelected) refused.push(skippedClear(field.id, 'Select fields are not cleared.'))
        continue
      }
      if (
        (field.type === 'radio-group' ||
          field.type === 'checkbox-group' ||
          field.type === 'checkbox') &&
        !settings.clear.includeChoiceControls
      ) {
        if (isSelected)
          refused.push(skippedClear(field.id, 'Choice controls are not cleared.'))
        continue
      }
      if (!selected && field.sensitivity === 'consent') continue
      operations.push({
        fieldId: field.id,
        explicitlySelected: isSelected,
        requireRestorable: true,
      })
    }
    for (const fieldId of request.fieldIds ?? []) {
      if (!known.has(fieldId))
        refused.push(skippedClear(fieldId, 'The field is no longer on the page.'))
    }
    return { operations, refused }
  }

  const generate = (request: GenerateRequest = {}): Promise<SyntheticGenerationResult[]> =>
    enqueue(async () => {
      requireReady()
      const { settings } = data.getSnapshot()
      if (!settings.synthetic.enabled) return []
      const selected = request.fieldIds ? new Set(request.fieldIds) : null
      const generators = [
        ...BUILTIN_GENERATORS,
        ...(config.registry?.list('generator') ?? []),
      ]
      const results: SyntheticGenerationResult[] = []
      const generated: Record<string, SyntheticGenerationResult> = { ...store.getState().generated }
      for (const field of store.getState().fields) {
        if (selected && !selected.has(field.id)) continue
        const result = generateForField(field, settings, { generators, now })
        if (!result) continue
        results.push(result)
        generated[field.id] = result
      }
      publish(detected, { generated })
      events.emit({
        type: 'generate:complete',
        results: results.map((entry) => ({
          fieldId: entry.fieldId,
          generatorId: entry.generatorId,
          valid: entry.valid,
        })),
      })
      return results
    })

  const clear = (request: ClearRequest = {}): Promise<ClearResult[]> =>
    enqueue(async () => {
      requireReady()
      const { operations, refused } = planClear(request)
      store.setState({ filling: true })
      let cleared: ClearResult[]
      try {
        cleared = operations.length > 0 ? await config.driver.clear(operations) : []
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
      const results = [...cleared, ...refused].sort(
        (a, b) => (order.get(a.fieldId) ?? Infinity) - (order.get(b.fieldId) ?? Infinity),
      )
      const snapshotId = cleared.find((result) => result.snapshotId)?.snapshotId ?? null
      if (snapshotId) undoSnapshotId = snapshotId
      store.setState({
        filling: false,
        canUndo: undoSnapshotId !== null,
        clearResults: Object.fromEntries(results.map((result) => [result.fieldId, result])),
      })
      events.emit({ type: 'clear:complete', results })
      if (cleared.some((result) => result.status === 'cleared')) await runScan()
      return results
    })

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
      case 'field-input': {
        const current = store.getState()
        if (!current.learningArmed || current.status !== 'ready') return
        const snapshot = data.getSnapshot()
        if (!snapshot.settings.learning.allowed) return
        const match = current.matches[event.field.id]
        if (
          shouldCaptureLearning({
            field: event.field,
            match,
            value: event.value,
            learningAllowed: true,
          })
        )
          return
        const answerValue = fieldValueToAnswerValue(event.field, event.value)
        if (!answerValue) return
        const duplicateOfAnswerId = findDuplicateAnswerId(
          event.field,
          answerValue,
          snapshot.answers,
        )
        const candidate = buildLearningCandidate({
          site: current.page?.hostname ?? '',
          field: event.field,
          value: answerValue,
          capturedAt: now(),
          duplicateOfAnswerId,
        })
        store.setState({
          learningCandidates: { ...current.learningCandidates, [candidate.id]: candidate },
        })
        events.emit({ type: 'learning:candidate', candidateId: candidate.id })
        break
      }
    }
  })

  const setLearningArmed = async (armed: boolean): Promise<void> => {
    requireReady()
    await config.driver.setLearningArmed(armed)
    store.setState({ learningArmed: armed, ...(armed ? {} : { learningCandidates: {} }) })
  }

  const confirmLearning = async (candidateId: string, draft: AnswerDraft): Promise<string> => {
    const candidate = store.getState().learningCandidates[candidateId]
    if (!candidate) throw new AutofillError('FIELD_NOT_FOUND', 'This learning suggestion is gone.')
    const saved = await data.answers.create(
      { ...draft, value: draft.value ?? candidate.value, source: 'learned' },
      { allowDuplicate: true },
    )
    const rest = { ...store.getState().learningCandidates }
    delete rest[candidateId]
    store.setState({ learningCandidates: rest })
    events.emit({ type: 'learning:saved', candidateId, answerId: saved.answer.id })
    await runScan()
    return saved.answer.id
  }

  const rejectLearning = (candidateId: string): void => {
    const rest = { ...store.getState().learningCandidates }
    if (!rest[candidateId]) return
    delete rest[candidateId]
    store.setState({ learningCandidates: rest })
    events.emit({ type: 'learning:rejected', candidateId })
  }

  return {
    store: data,
    getState: store.getState,
    subscribe: store.subscribe,
    on: events.on,
    connect,
    scan,
    fill,
    generate,
    clear,
    undo,
    setLearningArmed,
    confirmLearning,
    rejectLearning,
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
