import type {
  AnswerRecord,
  AutofillSettings,
  CustomFieldDefinition,
  FieldMapping,
  Profile,
} from '@ufa/core'
import { z } from 'zod'

/** Storage keys of the persisted collections. Each holds one JSON document. */
export const COLLECTION_KEYS = [
  'profiles',
  'answers',
  'customFields',
  'mappings',
  'settings',
] as const
export type CollectionKey = (typeof COLLECTION_KEYS)[number]

export const META_KEY = 'meta'
export const STORED_KEYS = [META_KEY, ...COLLECTION_KEYS] as const

export interface DataMeta {
  schemaVersion: number
  createdAt: number
  updatedAt: number
}

export const dataMetaSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

/** Everything the store keeps, validated. */
export interface AutofillData {
  profiles: Profile[]
  answers: AnswerRecord[]
  customFields: CustomFieldDefinition[]
  mappings: FieldMapping[]
  settings: AutofillSettings
}

/** Collections as read from storage, before validation. */
export type RawData = Partial<Record<CollectionKey, unknown>>
