import { z } from 'zod'

import { fieldValueSchema, type FieldValue } from './field'

export const FIELD_STATES = [
  'matched',
  'suggested',
  'missing',
  'ambiguous',
  'incompatible',
  'unsupported',
  'skipped',
  'filled',
  'failed',
  'generated',
] as const
export type FieldState = (typeof FIELD_STATES)[number]

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface MatchConfidence {
  score: number
  level: ConfidenceLevel
}

export interface MatchCandidate {
  answerId: string
  strategyId: string
  confidence: MatchConfidence
  /** Human-readable reason, e.g. "Same semantic key: email". */
  explanation: string
  /** The control-specific value, or null when the answer cannot be expressed for this control. */
  fillValue: FieldValue | null
  compatible: boolean
  incompatibilityReason: string | null
  profileId: string | null
}

export type MatchState = Extract<
  FieldState,
  'matched' | 'suggested' | 'missing' | 'ambiguous' | 'incompatible' | 'unsupported' | 'skipped'
>

export interface MatchResult {
  fieldId: string
  state: MatchState
  best: MatchCandidate | null
  candidates: MatchCandidate[]
  reason: string | null
}

export interface FillResult {
  fieldId: string
  status: 'filled' | 'unchanged' | 'skipped' | 'failed'
  reason: string | null
  verified: boolean
  snapshotId: string | null
}

export const fillResultSchema = z.object({
  fieldId: z.string(),
  status: z.enum(['filled', 'unchanged', 'skipped', 'failed']),
  reason: z.string().nullable(),
  verified: z.boolean(),
  snapshotId: z.string().nullable(),
})

export interface ClearResult {
  fieldId: string
  status: 'cleared' | 'unchanged' | 'skipped' | 'failed'
  reason: string | null
  verified: boolean
  snapshotId: string | null
}

export const clearResultSchema = z.object({
  fieldId: z.string(),
  status: z.enum(['cleared', 'unchanged', 'skipped', 'failed']),
  reason: z.string().nullable(),
  verified: z.boolean(),
  snapshotId: z.string().nullable(),
})

export interface RestoreResult {
  fieldId: string
  status: 'restored' | 'failed' | 'not-restorable'
  reason: string | null
}

export const restoreResultSchema = z.object({
  fieldId: z.string(),
  status: z.enum(['restored', 'failed', 'not-restorable']),
  reason: z.string().nullable(),
})

export interface SyntheticGenerationResult {
  fieldId: string
  generatorId: string
  value: FieldValue
  /** Always `generated`, so a generated value can never be mistaken for a saved one. */
  source: 'generated'
  valid: boolean
  validationMessage: string | null
  seed: string | null
}

export const syntheticGenerationResultSchema = z.object({
  fieldId: z.string(),
  generatorId: z.string(),
  value: fieldValueSchema,
  source: z.literal('generated'),
  valid: z.boolean(),
  validationMessage: z.string().nullable(),
  seed: z.string().nullable(),
})
