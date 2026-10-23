import { z } from 'zod'

import { answerValueSchema, type AnswerValue } from './answers'
import { fieldOptionSchema, fieldTypeSchema, type FieldOption, type FieldType } from './field'

export interface LearningCandidate {
  id: string
  site: string
  field: {
    label: string
    normalizedLabel: string
    type: FieldType
    section: string | null
    formTitle: string | null
    options: FieldOption[]
    semanticKey: string | null
  }
  value: AnswerValue
  capturedAt: number
  status: 'pending' | 'saved' | 'rejected'
  /** Existing answer this candidate duplicates or would update, if any. */
  duplicateOfAnswerId: string | null
}

export const learningCandidateSchema = z.object({
  id: z.string().min(1).max(100),
  site: z.string().max(253),
  field: z.object({
    label: z.string().max(1_000),
    normalizedLabel: z.string().max(1_000),
    type: fieldTypeSchema,
    section: z.string().max(500).nullable(),
    formTitle: z.string().max(500).nullable(),
    options: z.array(fieldOptionSchema).max(500),
    semanticKey: z.string().max(120).nullable(),
  }),
  value: answerValueSchema,
  capturedAt: z.number().int().nonnegative(),
  status: z.enum(['pending', 'saved', 'rejected']),
  duplicateOfAnswerId: z.string().max(100).nullable(),
})
