import {
  AutofillError,
  DEFAULT_PROFILE_TEMPLATE_ID,
  getProfileTemplate,
  type IdGenerator,
  type StorageAdapter,
} from '@ufa/core'

import { COLLECTION_KEYS, META_KEY, STORED_KEYS, dataMetaSchema, type RawData } from './keys'

export interface MigrationContext {
  now: number
  createId: IdGenerator
}

/**
 * One step of the stored-data schema. It receives the collections at `version - 1` (a private
 * copy it may modify) and returns them at `version`. A collection returned as `undefined` is
 * deleted. Steps must be pure: the runner writes the result once, after every step succeeded.
 */
export interface DataMigration {
  version: number
  description: string
  migrate(data: RawData, context: MigrationContext): RawData
}

export interface MigrationOutcome {
  from: number
  to: number
  applied: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const DATA_MIGRATIONS: readonly DataMigration[] = [
  {
    version: 1,
    description: 'Create the collections and a blank default profile',
    migrate(data, { now, createId }) {
      const profiles = Array.isArray(data.profiles) ? data.profiles : []
      const settings = isRecord(data.settings) ? data.settings : {}
      const next: RawData = {
        answers: [],
        customFields: [],
        mappings: [],
        ...data,
        profiles,
        settings,
      }
      if (profiles.length === 0) {
        const template = getProfileTemplate(DEFAULT_PROFILE_TEMPLATE_ID)
        const id = createId()
        next.profiles = [
          {
            id,
            name: template?.name ?? 'General',
            description: '',
            kind: template?.kind ?? 'general',
            isDefault: true,
            templateId: template?.id ?? null,
            createdAt: now,
            updatedAt: now,
          },
        ]
        next.settings = { ...settings, activeProfileId: id }
      }
      return next
    },
  },
]

/** The schema version these migrations produce. */
export function latestVersion(migrations: readonly DataMigration[]): number {
  return migrations.reduce((max, migration) => Math.max(max, migration.version), 0)
}

/**
 * Brings stored data up to the latest version in one write. Data from a newer version is never
 * touched; the caller should treat it as unavailable rather than risk overwriting it.
 */
export async function migrateData(
  adapter: StorageAdapter,
  options: { migrations: readonly DataMigration[]; now: number; createId: IdGenerator },
): Promise<MigrationOutcome> {
  const target = latestVersion(options.migrations)
  const raw = await adapter.getMany(STORED_KEYS)
  const storedMeta = raw[META_KEY]
  const meta = storedMeta === undefined ? null : dataMetaSchema.safeParse(storedMeta)
  if (meta && !meta.success) {
    throw new AutofillError(
      'STORAGE_ERROR',
      'Saved autofill data has an unreadable version marker.',
      {
        details: { reason: 'corrupt-meta' },
      },
    )
  }
  const from = meta?.data.schemaVersion ?? 0
  if (from > target) {
    throw new AutofillError(
      'STORAGE_ERROR',
      'Your autofill data was saved by a newer version. Update the extension to use it; nothing was changed.',
      { details: { reason: 'newer-schema', version: from, supported: target } },
    )
  }
  if (from === target) return { from, to: from, applied: [] }

  let data: RawData = {}
  for (const key of COLLECTION_KEYS) if (raw[key] !== undefined) data[key] = raw[key]
  let version = from
  const applied: string[] = []
  for (const migration of [...options.migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= version) continue
    if (migration.version !== version + 1) {
      throw new AutofillError('STORAGE_ERROR', `No migration from data version ${version}.`, {
        details: { reason: 'missing-migration', version },
      })
    }
    data = migration.migrate(structuredClone(data), {
      now: options.now,
      createId: options.createId,
    })
    version = migration.version
    applied.push(migration.description)
  }

  const entries: Record<string, unknown> = {}
  const removals: string[] = []
  for (const key of COLLECTION_KEYS) {
    if (data[key] !== undefined) entries[key] = data[key]
    else if (raw[key] !== undefined) removals.push(key)
  }
  entries[META_KEY] = {
    schemaVersion: version,
    createdAt: meta?.data.createdAt ?? options.now,
    updatedAt: options.now,
  }
  await adapter.setMany(entries)
  if (removals.length) await adapter.remove(removals)
  return { from, to: version, applied }
}
