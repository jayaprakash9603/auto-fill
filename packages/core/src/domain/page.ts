import { z } from 'zod'

import {
  fieldDescriptorSchema,
  fieldValueSchema,
  type FieldDescriptor,
  type FieldValue,
} from './field'

export interface PageInfo {
  url: string
  title: string
  hostname: string
  frameCount: number
  adapterId: string
  adapterName: string
  runtimeVersion: string
}

export const pageInfoSchema = z.object({
  url: z.string().max(4_000),
  title: z.string().max(1_000),
  hostname: z.string().max(253),
  frameCount: z.number().int().nonnegative(),
  adapterId: z.string().max(100),
  adapterName: z.string().max(200),
  runtimeVersion: z.string().max(50),
})

export interface ScanRequest {
  includeHidden: boolean
  includeDisabled: boolean
}
export type ScanRequestInput = { [K in keyof ScanRequest]?: ScanRequest[K] | undefined }

export const scanRequestSchema = z.object({
  includeHidden: z.boolean().default(false),
  includeDisabled: z.boolean().default(false),
})

export interface ScanResult {
  page: PageInfo
  fields: FieldDescriptor[]
  scannedAt: number
}

export const scanResultSchema = z.object({
  page: pageInfoSchema,
  fields: z.array(fieldDescriptorSchema).max(5_000),
  scannedAt: z.number().int().nonnegative(),
})

export const FILL_SOURCES = ['saved', 'generated', 'manual', 'restore'] as const
export type FillSource = (typeof FILL_SOURCES)[number]

export interface FillOperation {
  fieldId: string
  value: FieldValue
  allowOverwrite: boolean
  source: FillSource
  /** Required for consent controls; the user must have selected this exact field. */
  explicitlySelected: boolean
}
export type FillOperationInput = Omit<FillOperation, 'allowOverwrite' | 'explicitlySelected'> & {
  allowOverwrite?: boolean | undefined
  explicitlySelected?: boolean | undefined
}

export const fillOperationSchema = z.object({
  fieldId: z.string().min(1).max(200),
  value: fieldValueSchema,
  allowOverwrite: z.boolean().default(false),
  source: z.enum(FILL_SOURCES),
  explicitlySelected: z.boolean().default(false),
})

export interface ClearOperation {
  fieldId: string
  explicitlySelected: boolean
  /** Refuse to clear when the previous value cannot be captured for undo. */
  requireRestorable: boolean
}
export type ClearOperationInput = Pick<ClearOperation, 'fieldId'> & {
  explicitlySelected?: boolean | undefined
  requireRestorable?: boolean | undefined
}

export const clearOperationSchema = z.object({
  fieldId: z.string().min(1).max(200),
  explicitlySelected: z.boolean().default(false),
  requireRestorable: z.boolean().default(false),
})

export type PageEvent =
  /**
   * The complete, current field list of one frame. `frameId` is null where the sender cannot know
   * its frame (the in-page runtime); extension drivers fill it in from the message sender.
   */
  | { type: 'fields-changed'; frameId: number | null; fields: FieldDescriptor[] }
  /** The user changed an armed, unmatched field. Only emitted while learning is armed. */
  | { type: 'field-input'; field: FieldDescriptor; value: FieldValue }
  | { type: 'navigated'; url: string }
  | { type: 'disconnected'; reason: string }

export const pageEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('fields-changed'),
    frameId: z.number().int().nonnegative().nullable(),
    fields: z.array(fieldDescriptorSchema).max(5_000),
  }),
  z.object({
    type: z.literal('field-input'),
    field: fieldDescriptorSchema,
    value: fieldValueSchema,
  }),
  z.object({ type: z.literal('navigated'), url: z.string().max(4_000) }),
  z.object({ type: z.literal('disconnected'), reason: z.string().max(300) }),
])
