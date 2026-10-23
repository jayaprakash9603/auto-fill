import { z } from 'zod'

import {
  answerRecordSchema,
  fieldMappingSchema,
  profileSchema,
  type AnswerRecord,
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
  mappings: FieldMapping[]
  settings?: AutofillSettings | undefined
}

export const exportBundleSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.number().int().nonnegative(),
  profiles: z.array(profileSchema).max(500),
  answers: z.array(answerRecordSchema).max(20_000),
  mappings: z.array(fieldMappingSchema).max(20_000).default([]),
  settings: autofillSettingsSchema.optional(),
})
