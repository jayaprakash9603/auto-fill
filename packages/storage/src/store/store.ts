import {
  AutofillError,
  autofillSettingsSchema,
  createDefaultSettings,
  createId as defaultCreateId,
  customSemanticKey,
  ensureExtensionSafeZod,
  silentLogger,
  toAutofillError,
  type AnswerCategory,
  type AnswerRecord,
  type AnswerValue,
  type AutofillErrorCode,
  type AutofillSettings,
  type AutofillSettingsInput,
  type CustomFieldDefinition,
  type DataCollection,
  type ExportBundle,
  type FieldMapping,
  type IdGenerator,
  type Logger,
  type Profile,
  type StorageAdapter,
} from '@ufa/core'

import {
  buildAnswer,
  buildCustomField,
  buildProfile,
  draftOf,
  invalid,
  normalizeTags,
  uniqueProfileName,
  type AnswerDraft,
  type AnswerPatch,
  type CustomFieldDraft,
  type CustomFieldPatch,
  type ProfileDraft,
  type ProfilePatch,
} from './drafts'
import { COLLECTION_KEYS, META_KEY, type AutofillData, type CollectionKey } from './keys'
import { normalizeData, parseData, type DataIssue } from './load'
import { DATA_MIGRATIONS, migrateData, type DataMigration } from './migrations'
import { answerForKey, enforcePreferred, findDuplicateOf, resolveActiveProfile } from './queries'
import {
  buildExport,
  parseImport,
  planImport,
  type ExportOptions,
  type ImportOptions,
  type ImportReport,
  type ParsedImport,
} from './transfer'

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface StoreError {
  code: AutofillErrorCode
  message: string
  /** For example "newer-schema" when the data was written by a newer version. */
  reason?: string
}

export interface StoreSnapshot extends Readonly<AutofillData> {
  status: StoreStatus
  /** The profile used for filling: the selected one, else the default. */
  activeProfile: Profile | null
  issues: readonly DataIssue[]
  error: StoreError | null
}

export interface StoreChange {
  collections: DataCollection[]
  /** `external` when another page or context changed the data. */
  origin: 'local' | 'external'
  activeProfileChanged: boolean
}

export interface AutofillStoreOptions {
  adapter: StorageAdapter
  now?: () => number
  createId?: IdGenerator
  /** Replaces the built-in schema migrations (tests and hosts with their own steps). */
  migrations?: readonly DataMigration[]
  logger?: Logger
}

export interface AnswerBulkPatch {
  profileId?: string | null
  category?: AnswerCategory
  addTags?: readonly string[]
  removeTags?: readonly string[]
}

export interface SaveAnswerResult {
  answer: AnswerRecord
  /** False when an identical answer already existed and was returned instead. */
  created: boolean
}

export interface AutofillStore {
  readonly adapterId: string
  /** Loads and migrates the data. Never rejects; failures show up in `getSnapshot().status`. */
  ready(): Promise<void>
  getSnapshot(): StoreSnapshot
  subscribe(listener: () => void): () => void
  onChange(listener: (change: StoreChange) => void): () => void
  /** Re-reads storage, for example after the host changed it directly. */
  reload(): Promise<void>
  dispose(): void

  profiles: {
    create(draft: ProfileDraft): Promise<Profile>
    update(id: string, patch: ProfilePatch): Promise<Profile>
    /** Copies the profile and its own answers. */
    duplicate(id: string, name?: string): Promise<Profile>
    /** Deletes the profile with its own answers and mappings. The last profile cannot be removed. */
    remove(id: string): Promise<{ removedAnswers: number }>
    setDefault(id: string): Promise<void>
    /** Selects the profile used for filling; `null` falls back to the default profile. */
    setActive(id: string | null): Promise<void>
  }

  answers: {
    /** Returns the existing answer instead when an identical one is already saved. */
    create(draft: AnswerDraft, options?: { allowDuplicate?: boolean }): Promise<SaveAnswerResult>
    update(id: string, patch: AnswerPatch): Promise<AnswerRecord>
    remove(ids: readonly string[]): Promise<number>
    bulkUpdate(ids: readonly string[], patch: AnswerBulkPatch): Promise<number>
    /** Folds `mergeIds` into `keepId`: aliases, tags and usage are combined, mappings repointed. */
    merge(keepId: string, mergeIds: readonly string[]): Promise<AnswerRecord>
    recordUsage(ids: readonly string[]): Promise<void>
    /**
     * Sets the context-free answer for a field in one scope, as a profile editor does. An empty
     * value removes it. Returns the saved answer, or null when removed.
     */
    setForField(input: {
      semanticKey: string
      label: string
      profileId: string | null
      value: AnswerValue | null
    }): Promise<AnswerRecord | null>
  }

  customFields: {
    create(draft: CustomFieldDraft): Promise<CustomFieldDefinition>
    update(key: string, patch: CustomFieldPatch): Promise<CustomFieldDefinition>
    /** Removes the definition; answers that used it keep their label and value. */
    remove(key: string): Promise<{ detachedAnswers: number }>
  }

  settings: {
    update(patch: AutofillSettingsInput): Promise<AutofillSettings>
  }

  transfer: {
    export(options?: ExportOptions): Promise<ExportBundle>
    parse(input: string | unknown): ParsedImport
    /** What an import would do, without changing anything. */
    preview(bundle: ExportBundle, options?: ImportOptions): Promise<ImportReport>
    import(bundle: ExportBundle, options?: ImportOptions): Promise<ImportReport>
  }

  /** Deletes every profile, answer, custom field, mapping and setting, then starts fresh. */
  deleteAll(): Promise<void>
}

function emptyData(): AutofillData {
  return {
    profiles: [],
    answers: [],
    customFields: [],
    mappings: [],
    settings: createDefaultSettings(),
  }
}

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

const notFound = (what: string) => invalid(`That ${what} no longer exists.`)

function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

/**
 * Profiles, answers, custom fields, mappings and settings on top of any `StorageAdapter`.
 *
 * Writes are serialized and each one re-reads storage first, so two pages editing at once lose as
 * little as possible. Changes from other pages arrive through the adapter's `subscribe`.
 */
export function createAutofillStore(options: AutofillStoreOptions): AutofillStore {
  ensureExtensionSafeZod()
  const adapter = options.adapter
  const now = options.now ?? Date.now
  const createId = options.createId ?? defaultCreateId
  const migrations = options.migrations ?? DATA_MIGRATIONS
  const logger = options.logger ?? silentLogger

  let data = emptyData()
  let issues: DataIssue[] = []
  let status: StoreStatus = 'idle'
  let error: StoreError | null = null
  let snapshot = buildSnapshot()
  let readyPromise: Promise<void> | null = null
  let queue: Promise<unknown> = Promise.resolve()
  let stopAdapter: (() => void) | null = null
  let reloadScheduled = false
  let disposed = false
  const listeners = new Set<() => void>()
  const changeListeners = new Set<(change: StoreChange) => void>()

  function buildSnapshot(): StoreSnapshot {
    return {
      ...data,
      status,
      activeProfile: resolveActiveProfile(data.profiles, data.settings),
      issues,
      error,
    }
  }

  const publish = (change: StoreChange | null) => {
    snapshot = buildSnapshot()
    listeners.forEach((listener) => listener())
    if (change && change.collections.length)
      changeListeners.forEach((listener) => {
        try {
          listener(change)
        } catch (failure) {
          logger.warn('store change listener failed', failure)
        }
      })
  }

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  /** Replaces the cached data and reports which collections differ; `null` origin reports nothing. */
  const adopt = (
    next: AutofillData,
    nextIssues: DataIssue[],
    origin: StoreChange['origin'] | null,
  ) => {
    const changed = COLLECTION_KEYS.filter((key) => !sameJson(data[key], next[key]))
    const previousActive = snapshot.activeProfile?.id ?? null
    const kept = Object.fromEntries(
      COLLECTION_KEYS.map((key) => [key, changed.includes(key) ? next[key] : data[key]]),
    ) as unknown as AutofillData
    data = kept
    const issuesChanged = !sameJson(issues, nextIssues)
    issues = nextIssues
    if (!changed.length && !issuesChanged) return
    const activeProfileChanged =
      (resolveActiveProfile(data.profiles, data.settings)?.id ?? null) !== previousActive
    publish(origin ? { collections: changed, origin, activeProfileChanged } : null)
  }

  const readAll = async () => parseData(await adapter.getMany(COLLECTION_KEYS))

  const load = async (origin: StoreChange['origin'] | null) => {
    const loaded = await readAll()
    adopt(loaded.data, loaded.issues, origin)
  }

  const fail = (failure: unknown) => {
    const converted = toAutofillError(failure, 'STORAGE_ERROR')
    const reason = converted.details?.reason
    status = 'error'
    error = {
      code: converted.code,
      message: converted.message,
      ...(typeof reason === 'string' ? { reason } : {}),
    }
    logger.warn('autofill data unavailable', { code: converted.code, reason })
    publish(null)
  }

  const scheduleReload = () => {
    if (reloadScheduled || disposed) return
    reloadScheduled = true
    void enqueue(async () => {
      reloadScheduled = false
      if (status !== 'ready' || disposed) return
      try {
        await load('external')
      } catch (failure) {
        logger.warn('reloading autofill data failed', failure)
      }
    })
  }

  const ready = (): Promise<void> => {
    if (readyPromise) return readyPromise
    status = 'loading'
    publish(null)
    readyPromise = enqueue(async () => {
      try {
        await migrateData(adapter, { migrations, now: now(), createId })
        await load(null)
        status = 'ready'
        error = null
        publish(null)
        if (!disposed && adapter.subscribe && !stopAdapter) {
          stopAdapter = adapter.subscribe((keys) => {
            if (
              keys.some(
                (key) => key === META_KEY || (COLLECTION_KEYS as readonly string[]).includes(key),
              )
            )
              scheduleReload()
          })
        }
      } catch (failure) {
        fail(failure)
      }
    })
    return readyPromise
  }

  /**
   * Runs `operation` on freshly read data and writes the collections it returns in one batch.
   * Invalid records found while reading are written back untouched.
   */
  const mutate = async <T>(
    operation: (current: AutofillData) => { changes: Partial<AutofillData>; result: T },
  ): Promise<T> => {
    if (disposed) throw new AutofillError('DESTROYED', 'This autofill store was disposed.')
    await ready()
    return enqueue(async () => {
      if (status !== 'ready')
        throw new AutofillError(
          error?.code ?? 'STORAGE_ERROR',
          error?.message ?? 'Autofill data is unavailable.',
        )
      const fresh = await readAll()
      const { changes, result } = operation(fresh.data)
      const keys = Object.keys(changes) as CollectionKey[]
      if (keys.length) {
        const entries: Record<string, unknown> = {}
        for (const key of keys) {
          entries[key] =
            key === 'settings'
              ? changes.settings
              : [...(changes[key] as unknown[]), ...fresh.invalid[key]]
        }
        await adapter.setMany(entries)
      }
      adopt(normalizeData({ ...fresh.data, ...changes }), fresh.issues, 'local')
      return result
    })
  }

  const requireProfile = (current: AutofillData, id: string) => {
    const profile = current.profiles.find((entry) => entry.id === id)
    if (!profile) throw notFound('profile')
    return profile
  }

  const requireAnswer = (current: AutofillData, id: string) => {
    const answer = current.answers.find((entry) => entry.id === id)
    if (!answer) throw notFound('answer')
    return answer
  }

  const saveAnswer = (current: AutofillData, record: AnswerRecord): AnswerRecord[] => {
    const index = current.answers.findIndex((answer) => answer.id === record.id)
    const answers =
      index >= 0
        ? current.answers.map((answer, position) => (position === index ? record : answer))
        : [...current.answers, record]
    return record.preferred ? enforcePreferred(answers, record.id) : answers
  }

  return {
    adapterId: adapter.id,
    ready,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onChange(listener) {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
    async reload() {
      await ready()
      await enqueue(() => (status === 'ready' ? load('external') : Promise.resolve()))
    },
    dispose() {
      disposed = true
      stopAdapter?.()
      stopAdapter = null
      listeners.clear()
      changeListeners.clear()
    },

    profiles: {
      create: (draft) =>
        mutate((current) => {
          const profile = buildProfile(current, draft, { id: createId(), now: now() })
          return { changes: { profiles: [...current.profiles, profile] }, result: profile }
        }),
      update: (id, patch) =>
        mutate((current) => {
          const existing = requireProfile(current, id)
          const profile = buildProfile(
            current,
            {
              name: patch.name ?? existing.name,
              description: patch.description ?? existing.description,
              kind: patch.kind ?? existing.kind,
              templateId: patch.templateId === undefined ? existing.templateId : patch.templateId,
            },
            { id, now: now(), existing },
          )
          return {
            changes: {
              profiles: current.profiles.map((entry) => (entry.id === id ? profile : entry)),
            },
            result: profile,
          }
        }),
      duplicate: (id, name) =>
        mutate((current) => {
          const source = requireProfile(current, id)
          const at = now()
          const profile: Profile = {
            ...buildProfile(
              current,
              {
                name: name?.trim() ? name : uniqueProfileName(current, `${source.name} copy`),
                description: source.description,
                kind: source.kind,
                templateId: source.templateId,
              },
              { id: createId(), now: at },
            ),
            isDefault: false,
          }
          const copies = current.answers
            .filter((answer) => answer.profileId === id)
            .map((answer) => ({
              ...answer,
              id: createId(),
              profileId: profile.id,
              createdAt: at,
              updatedAt: at,
              lastUsedAt: null,
              usageCount: 0,
            }))
          return {
            changes: {
              profiles: [...current.profiles, profile],
              answers: [...current.answers, ...copies],
            },
            result: profile,
          }
        }),
      remove: (id) =>
        mutate((current) => {
          const profile = requireProfile(current, id)
          if (current.profiles.length <= 1) throw invalid('Keep at least one profile.')
          const remaining = current.profiles.filter((entry) => entry.id !== id)
          const nextDefault = profile.isDefault ? remaining[0]?.id : undefined
          const removedAnswerIds = new Set(
            current.answers.filter((answer) => answer.profileId === id).map((answer) => answer.id),
          )
          return {
            changes: {
              profiles: remaining.map((entry) =>
                entry.id === nextDefault ? { ...entry, isDefault: true } : entry,
              ),
              answers: current.answers.filter((answer) => !removedAnswerIds.has(answer.id)),
              mappings: current.mappings.filter(
                (mapping) => mapping.profileId !== id && !removedAnswerIds.has(mapping.answerId),
              ),
              settings:
                current.settings.activeProfileId === id
                  ? { ...current.settings, activeProfileId: null }
                  : current.settings,
            },
            result: { removedAnswers: removedAnswerIds.size },
          }
        }),
      setDefault: (id) =>
        mutate((current) => {
          requireProfile(current, id)
          return {
            changes: {
              profiles: current.profiles.map((entry) =>
                entry.isDefault === (entry.id === id)
                  ? entry
                  : { ...entry, isDefault: entry.id === id },
              ),
            },
            result: undefined,
          }
        }),
      setActive: (id) =>
        mutate((current) => {
          if (id !== null) requireProfile(current, id)
          return {
            changes: { settings: { ...current.settings, activeProfileId: id } },
            result: undefined,
          }
        }),
    },

    answers: {
      create: (draft, createOptions = {}) =>
        mutate<SaveAnswerResult>((current) => {
          const answer = buildAnswer(current, draft, { id: createId(), now: now() })
          const duplicate = createOptions.allowDuplicate
            ? null
            : findDuplicateOf(current.answers, answer)
          if (duplicate) return { changes: {}, result: { answer: duplicate, created: false } }
          return {
            changes: { answers: saveAnswer(current, answer) },
            result: { answer, created: true },
          }
        }),
      update: (id, patch) =>
        mutate((current) => {
          const existing = requireAnswer(current, id)
          const answer = buildAnswer(
            current,
            { ...draftOf(existing), ...removeUndefined(patch) },
            { id, now: now(), existing },
          )
          return { changes: { answers: saveAnswer(current, answer) }, result: answer }
        }),
      remove: (ids) =>
        mutate((current) => {
          const drop = new Set(ids)
          const answers = current.answers.filter((answer) => !drop.has(answer.id))
          return {
            changes: {
              answers,
              mappings: current.mappings.filter((mapping) => !drop.has(mapping.answerId)),
            },
            result: current.answers.length - answers.length,
          }
        }),
      bulkUpdate: (ids, patch) =>
        mutate((current) => {
          if (patch.profileId != null) requireProfile(current, patch.profileId)
          const targets = new Set(ids)
          const add = normalizeTags(patch.addTags ?? [])
          const removeTags = new Set((patch.removeTags ?? []).map((tag) => tag.toLowerCase()))
          const at = now()
          let changed = 0
          const answers = current.answers.map((answer) => {
            if (!targets.has(answer.id)) return answer
            const next: AnswerRecord = {
              ...answer,
              ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
              ...(patch.category ? { category: patch.category } : {}),
              tags: normalizeTags([
                ...answer.tags.filter((tag) => !removeTags.has(tag.toLowerCase())),
                ...add,
              ]),
            }
            if (sameJson(next, answer)) return answer
            changed += 1
            return { ...next, updatedAt: at }
          })
          return { changes: changed ? { answers: enforcePreferred(answers) } : {}, result: changed }
        }),
      merge: (keepId, mergeIds) =>
        mutate((current) => {
          const keep = requireAnswer(current, keepId)
          const others = mergeIds
            .filter((id) => id !== keepId)
            .map((id) => requireAnswer(current, id))
          const merged = buildAnswer(
            current,
            {
              ...draftOf(keep),
              aliases: [keep, ...others].flatMap((answer) => [
                ...answer.aliases.map((alias) => alias.text),
                ...(answer === keep ? [] : [answer.label]),
              ]),
              tags: [keep, ...others].flatMap((answer) => answer.tags),
              preferred: [keep, ...others].some((answer) => answer.preferred),
            },
            { id: keepId, now: now(), existing: keep },
          )
          const record: AnswerRecord = {
            ...merged,
            createdAt: Math.min(keep.createdAt, ...others.map((answer) => answer.createdAt)),
            usageCount: [keep, ...others].reduce((sum, answer) => sum + answer.usageCount, 0),
            lastUsedAt:
              [keep, ...others]
                .map((answer) => answer.lastUsedAt)
                .filter((value): value is number => value !== null)
                .sort((a, b) => b - a)[0] ?? null,
          }
          const drop = new Set(others.map((answer) => answer.id))
          const mappings: FieldMapping[] = current.mappings.map((mapping) =>
            drop.has(mapping.answerId) ? { ...mapping, answerId: keepId } : mapping,
          )
          return {
            changes: {
              answers: saveAnswer(
                { ...current, answers: current.answers.filter((answer) => !drop.has(answer.id)) },
                record,
              ),
              mappings,
            },
            result: record,
          }
        }),
      recordUsage: (ids) =>
        mutate((current) => {
          const targets = new Set(ids)
          const at = now()
          if (!current.answers.some((answer) => targets.has(answer.id)))
            return { changes: {}, result: undefined }
          return {
            changes: {
              answers: current.answers.map((answer) =>
                targets.has(answer.id)
                  ? { ...answer, usageCount: answer.usageCount + 1, lastUsedAt: at }
                  : answer,
              ),
            },
            result: undefined,
          }
        }),
      setForField: (input) =>
        mutate((current) => {
          const existing = answerForKey(current.answers, input.profileId, input.semanticKey)
          const empty =
            input.value === null ||
            (input.value.kind === 'text' && !input.value.text.trim()) ||
            (input.value.kind === 'list' && !input.value.items.some((item) => item.trim()))
          if (empty) {
            if (!existing) return { changes: {}, result: null }
            return {
              changes: {
                answers: current.answers.filter((answer) => answer.id !== existing.id),
                mappings: current.mappings.filter((mapping) => mapping.answerId !== existing.id),
              },
              result: null,
            }
          }
          const value = input.value as AnswerValue
          const answer = existing
            ? buildAnswer(
                current,
                { ...draftOf(existing), value },
                { id: existing.id, now: now(), existing },
              )
            : buildAnswer(
                current,
                {
                  label: input.label,
                  value,
                  semanticKey: input.semanticKey,
                  profileId: input.profileId,
                },
                { id: createId(), now: now() },
              )
          if (existing && sameJson(existing.value, answer.value))
            return { changes: {}, result: existing }
          return { changes: { answers: saveAnswer(current, answer) }, result: answer }
        }),
    },

    customFields: {
      create: (draft) =>
        mutate((current) => {
          const base = customSemanticKey(draft.label)
          const taken = new Set(current.customFields.map((field) => field.key))
          let key = base
          for (let index = 2; taken.has(key); index += 1) key = `${base.slice(0, 96)}-${index}`
          const field = buildCustomField(current, draft, { key, now: now() })
          return { changes: { customFields: [...current.customFields, field] }, result: field }
        }),
      update: (key, patch) =>
        mutate((current) => {
          const existing = current.customFields.find((field) => field.key === key)
          if (!existing) throw notFound('custom field')
          const field = buildCustomField(
            current,
            {
              label: patch.label ?? existing.label,
              description: patch.description ?? existing.description,
              category: patch.category ?? existing.category,
              aliases: patch.aliases ?? existing.aliases.map((alias) => alias.text),
              controlTypes: patch.controlTypes ?? existing.controlTypes,
            },
            { key, now: now(), existing },
          )
          return {
            changes: {
              customFields: current.customFields.map((entry) =>
                entry.key === key ? field : entry,
              ),
            },
            result: field,
          }
        }),
      remove: (key) =>
        mutate((current) => {
          if (!current.customFields.some((field) => field.key === key))
            throw notFound('custom field')
          let detached = 0
          const answers = current.answers.map((answer) => {
            if (answer.semanticKey !== key) return answer
            detached += 1
            return { ...answer, semanticKey: null }
          })
          return {
            changes: {
              customFields: current.customFields.filter((field) => field.key !== key),
              ...(detached ? { answers } : {}),
            },
            result: { detachedAnswers: detached },
          }
        }),
    },

    settings: {
      update: (patch) =>
        mutate((current) => {
          const base = current.settings
          const section = <K extends keyof AutofillSettings>(key: K) =>
            patch[key] === undefined
              ? base[key]
              : { ...(base[key] as object), ...removeUndefined(patch[key] as object) }
          const parsed = autofillSettingsSchema.safeParse({
            ...base,
            ...removeUndefined(patch),
            thresholds: section('thresholds'),
            trusted: section('trusted'),
            learning: section('learning'),
            synthetic: section('synthetic'),
            clear: section('clear'),
            diagnostics: section('diagnostics'),
          })
          if (!parsed.success)
            throw invalid(parsed.error.issues[0]?.message ?? 'These settings are not valid.')
          if (parsed.data.activeProfileId !== null)
            requireProfile(current, parsed.data.activeProfileId)
          return { changes: { settings: parsed.data }, result: parsed.data }
        }),
    },

    transfer: {
      async export(exportOptions = {}) {
        await ready()
        if (status !== 'ready') throw new AutofillError('STORAGE_ERROR', error?.message)
        return buildExport(data, exportOptions, now())
      },
      parse: parseImport,
      async preview(bundle, importOptions = {}) {
        await ready()
        return planImport(data, bundle, importOptions, { now: now(), createId }).report
      },
      import: (bundle, importOptions = {}) =>
        mutate((current) => {
          const { data: next, report } = planImport(current, bundle, importOptions, {
            now: now(),
            createId,
          })
          const changes: Partial<AutofillData> = {}
          for (const key of COLLECTION_KEYS)
            if (!sameJson(current[key], next[key])) Object.assign(changes, { [key]: next[key] })
          return { changes, result: report }
        }),
    },

    async deleteAll() {
      if (disposed) throw new AutofillError('DESTROYED', 'This autofill store was disposed.')
      await ready()
      await enqueue(async () => {
        await adapter.remove([META_KEY, ...COLLECTION_KEYS])
        try {
          await migrateData(adapter, { migrations, now: now(), createId })
          await load('local')
          status = 'ready'
          error = null
          publish(null)
        } catch (failure) {
          fail(failure)
          throw toAutofillError(failure, 'STORAGE_ERROR')
        }
      })
    },
  }
}
