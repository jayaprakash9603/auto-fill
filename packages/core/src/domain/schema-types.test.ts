import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import type {
  answerAliasSchema,
  answerContextSchema,
  answerRecordSchema,
  answerValueSchema,
  fieldMappingSchema,
  profileSchema,
} from './answers'
import {
  type AnswerAlias,
  type AnswerContext,
  type AnswerRecord,
  type AnswerRecordInput,
  type AnswerValue,
  type FieldMapping,
  type Profile,
} from './answers'
import type { exportBundleSchema } from './export'
import { type ExportBundle } from './export'
import type {
  fieldAriaSchema,
  fieldDescriptorSchema,
  fieldOptionSchema,
  fieldValueSchema,
} from './field'
import { type FieldAria, type FieldDescriptor, type FieldOption, type FieldValue } from './field'
import type { learningCandidateSchema } from './learning'
import { type LearningCandidate } from './learning'
import type {
  clearOperationSchema,
  fillOperationSchema,
  pageEventSchema,
  pageInfoSchema,
  scanRequestSchema,
  scanResultSchema,
} from './page'
import {
  type ClearOperation,
  type ClearOperationInput,
  type FillOperation,
  type FillOperationInput,
  type PageEvent,
  type PageInfo,
  type ScanRequest,
  type ScanRequestInput,
  type ScanResult,
} from './page'
import type {
  clearResultSchema,
  fillResultSchema,
  restoreResultSchema,
  syntheticGenerationResultSchema,
} from './results'
import {
  type ClearResult,
  type FillResult,
  type RestoreResult,
  type SyntheticGenerationResult,
} from './results'
import type { autofillSettingsSchema, confidenceThresholdsSchema } from './settings'
import {
  type AutofillSettings,
  type AutofillSettingsInput,
  type ConfidenceThresholds,
} from './settings'

/*
 * Public types are written out by hand so published declarations never depend on Zod. These
 * compile-time checks keep each one identical to what its schema produces (`Out`) and accepts (`In`).
 */
type Simplify<T> = T extends object ? { [K in keyof T]: T[K] } & {} : T
type Identical<A, B> =
  (<T>() => T extends Simplify<A> ? 1 : 2) extends <T>() => T extends Simplify<B> ? 1 : 2
    ? true
    : false
type Out<S extends z.ZodType, T> = Identical<z.output<S>, T>
type In<S extends z.ZodType, T> = Identical<z.input<S>, T>

const checks: Record<string, true> = {
  FieldValue: true satisfies Out<typeof fieldValueSchema, FieldValue>,
  FieldOption: true satisfies Out<typeof fieldOptionSchema, FieldOption>,
  FieldAria: true satisfies Out<typeof fieldAriaSchema, FieldAria>,
  FieldDescriptor: true satisfies Out<typeof fieldDescriptorSchema, FieldDescriptor>,
  AnswerValue: true satisfies Out<typeof answerValueSchema, AnswerValue>,
  AnswerAlias: true satisfies Out<typeof answerAliasSchema, AnswerAlias>,
  AnswerContext: true satisfies Out<typeof answerContextSchema, AnswerContext>,
  AnswerRecord: true satisfies Out<typeof answerRecordSchema, AnswerRecord>,
  AnswerRecordInput: true satisfies In<typeof answerRecordSchema, AnswerRecordInput>,
  Profile: true satisfies Out<typeof profileSchema, Profile>,
  FieldMapping: true satisfies Out<typeof fieldMappingSchema, FieldMapping>,
  ConfidenceThresholds: true satisfies Out<typeof confidenceThresholdsSchema, ConfidenceThresholds>,
  AutofillSettings: true satisfies Out<typeof autofillSettingsSchema, AutofillSettings>,
  AutofillSettingsInput: true satisfies In<typeof autofillSettingsSchema, AutofillSettingsInput>,
  PageInfo: true satisfies Out<typeof pageInfoSchema, PageInfo>,
  ScanRequest: true satisfies Out<typeof scanRequestSchema, ScanRequest>,
  ScanRequestInput: true satisfies In<typeof scanRequestSchema, ScanRequestInput>,
  ScanResult: true satisfies Out<typeof scanResultSchema, ScanResult>,
  FillOperation: true satisfies Out<typeof fillOperationSchema, FillOperation>,
  FillOperationInput: true satisfies In<typeof fillOperationSchema, FillOperationInput>,
  ClearOperation: true satisfies Out<typeof clearOperationSchema, ClearOperation>,
  ClearOperationInput: true satisfies In<typeof clearOperationSchema, ClearOperationInput>,
  PageEvent: true satisfies Out<typeof pageEventSchema, PageEvent>,
  FillResult: true satisfies Out<typeof fillResultSchema, FillResult>,
  ClearResult: true satisfies Out<typeof clearResultSchema, ClearResult>,
  RestoreResult: true satisfies Out<typeof restoreResultSchema, RestoreResult>,
  SyntheticGenerationResult: true satisfies Out<
    typeof syntheticGenerationResultSchema,
    SyntheticGenerationResult
  >,
  LearningCandidate: true satisfies Out<typeof learningCandidateSchema, LearningCandidate>,
  ExportBundle: true satisfies Out<typeof exportBundleSchema, ExportBundle>,
}

describe('domain types match their schemas', () => {
  it('is enforced by the type checker', () => {
    expect(Object.values(checks).every(Boolean)).toBe(true)
  })
})
