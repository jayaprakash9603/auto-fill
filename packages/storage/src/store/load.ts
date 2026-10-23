import {
  answerRecordSchema,
  autofillSettingsSchema,
  createDefaultSettings,
  customFieldSchema,
  fieldMappingSchema,
  profileSchema,
  type DataCollection,
} from '@ufa/core'
import type { z } from 'zod'

import type { AutofillData, CollectionKey, RawData } from './keys'

export interface DataIssue {
  collection: DataCollection
  /** Records that failed validation. They stay in storage untouched and are not used. */
  count: number
  message: string
}

/** Records that failed validation, kept so that rewriting a collection never drops them. */
export type InvalidRecords = Record<Exclude<CollectionKey, 'settings'>, unknown[]>

export interface LoadedData {
  data: AutofillData
  invalid: InvalidRecords
  issues: DataIssue[]
}

function parseList<S extends z.ZodType>(
  raw: unknown,
  schema: S,
): { items: z.output<S>[]; invalid: unknown[] } {
  if (raw === undefined) return { items: [], invalid: [] }
  if (!Array.isArray(raw)) return { items: [], invalid: [raw] }
  const items: z.output<S>[] = []
  const invalid: unknown[] = []
  for (const entry of raw) {
    const parsed = schema.safeParse(entry)
    if (parsed.success) items.push(parsed.data)
    else invalid.push(entry)
  }
  return { items, invalid }
}

const byCreatedAt = (a: { createdAt: number }, b: { createdAt: number }) =>
  a.createdAt - b.createdAt

/**
 * Restores the invariants the rest of the engine relies on: exactly one default profile, unique
 * ids and custom-field keys, and an active profile that exists.
 */
export function normalizeData(data: AutofillData): AutofillData {
  const seenProfiles = new Set<string>()
  const profiles = data.profiles.filter((profile) => {
    if (seenProfiles.has(profile.id)) return false
    seenProfiles.add(profile.id)
    return true
  })
  const defaultId =
    profiles.find((profile) => profile.isDefault)?.id ?? [...profiles].sort(byCreatedAt)[0]?.id
  const normalizedProfiles = profiles
    .map((profile) =>
      profile.isDefault === (profile.id === defaultId)
        ? profile
        : { ...profile, isDefault: profile.id === defaultId },
    )
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )

  const seenAnswers = new Set<string>()
  const answers = data.answers.filter((answer) => {
    if (seenAnswers.has(answer.id)) return false
    seenAnswers.add(answer.id)
    return true
  })
  const seenKeys = new Set<string>()
  const customFields = data.customFields
    .filter((field) => {
      if (seenKeys.has(field.key)) return false
      seenKeys.add(field.key)
      return true
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))

  const activeProfileId = data.settings.activeProfileId
  const settings =
    activeProfileId !== null && !seenProfiles.has(activeProfileId)
      ? { ...data.settings, activeProfileId: null }
      : data.settings

  return { profiles: normalizedProfiles, answers, customFields, mappings: data.mappings, settings }
}

export function parseData(raw: RawData): LoadedData {
  const profiles = parseList(raw.profiles, profileSchema)
  const answers = parseList(raw.answers, answerRecordSchema)
  const customFields = parseList(raw.customFields, customFieldSchema)
  const mappings = parseList(raw.mappings, fieldMappingSchema)
  const settingsResult =
    raw.settings === undefined ? null : autofillSettingsSchema.safeParse(raw.settings)

  const issues: DataIssue[] = []
  const report = (collection: DataCollection, count: number, noun: string) => {
    if (count > 0)
      issues.push({
        collection,
        count,
        message: `${count} saved ${noun}${count === 1 ? '' : 's'} could not be read and ${count === 1 ? 'is' : 'are'} ignored.`,
      })
  }
  report('profiles', profiles.invalid.length, 'profile')
  report('answers', answers.invalid.length, 'answer')
  report('customFields', customFields.invalid.length, 'custom field')
  report('mappings', mappings.invalid.length, 'field mapping')
  if (settingsResult && !settingsResult.success)
    issues.push({
      collection: 'settings',
      count: 1,
      message: 'Saved settings could not be read; defaults are used until you change a setting.',
    })

  return {
    data: normalizeData({
      profiles: profiles.items,
      answers: answers.items,
      customFields: customFields.items,
      mappings: mappings.items,
      settings: settingsResult?.success ? settingsResult.data : createDefaultSettings(),
    }),
    invalid: {
      profiles: profiles.invalid,
      answers: answers.invalid,
      customFields: customFields.invalid,
      mappings: mappings.invalid,
    },
    issues,
  }
}
