import { z } from 'zod'

import {
  answerRecordSchema,
  customFieldSchema,
  fieldMappingSchema,
  profileSchema,
  type AnswerRecord,
  type CustomFieldDefinition,
  type FieldMapping,
  type Profile,
} from './answers'
import { autofillSettingsSchema, type AutofillSettings } from './settings'

export const EXPORT_FORMAT = 'universal-form-autofill/export'
export const EXPORT_VERSION = 1

export interface ExportBundle {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: number
  profiles: Profile[]
  answers: AnswerRecord[]
  customFields: CustomFieldDefinition[]
  mappings: FieldMapping[]
  settings?: AutofillSettings | undefined
}

/** Largest export file accepted for import, in characters of JSON. */
export const MAX_IMPORT_LENGTH = 10_000_000

export const exportBundleSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.number().int().nonnegative(),
  profiles: z.array(profileSchema).max(500),
  answers: z.array(answerRecordSchema).max(20_000),
  customFields: z.array(customFieldSchema).max(2_000).default([]),
  mappings: z.array(fieldMappingSchema).max(20_000).default([]),
  settings: autofillSettingsSchema.optional(),
})
