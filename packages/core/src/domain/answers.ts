import { z } from 'zod'

import { fieldTypeSchema, type FieldType } from './field'

export const ANSWER_CATEGORIES = [
  'personal',
  'contact',
  'address',
  'professional',
  'education',
  'eligibility',
  'preferences',
  'links',
  'custom',
] as const
export type AnswerCategory = (typeof ANSWER_CATEGORIES)[number]
export const answerCategorySchema = z.enum(ANSWER_CATEGORIES)

/** A saved answer, independent of any control. Converted to a `FieldValue` per field during matching. */
export type AnswerValue =
  | { kind: 'text'; text: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'list'; items: string[] }

export const answerValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().max(20_000) }),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }),
  z.object({ kind: z.literal('list'), items: z.array(z.string().min(1).max(1_000)).max(200) }),
])

export interface AnswerAlias {
  text: string
  normalized: string
}

export const answerAliasSchema = z.object({
  text: z.string().min(1).max(300),
  normalized: z.string().max(300),
})

export interface AnswerContext {
  /** Hostnames (suffix match). Empty means any site. */
  sites: string[]
  /** Normalized keywords that should appear in the field's section heading. */
  sectionKeywords: string[]
  /** Normalized keywords that should appear in the form title or page title. */
  formKeywords: string[]
  applicationTypes: string[]
}

export const answerContextSchema = z.object({
  sites: z.array(z.string().min(1).max(253)).max(100).default([]),
  sectionKeywords: z.array(z.string().min(1).max(100)).max(50).default([]),
  formKeywords: z.array(z.string().min(1).max(100)).max(50).default([]),
  applicationTypes: z.array(z.string().min(1).max(100)).max(50).default([]),
})

export const ANSWER_SOURCES = ['manual', 'learned', 'imported'] as const
export type AnswerSource = (typeof ANSWER_SOURCES)[number]

export interface AnswerRecord {
  id: string
  label: string
  semanticKey: string | null
  aliases: AnswerAlias[]
  value: AnswerValue
  /** `null` means the answer is global and available to every profile. */
  profileId: string | null
  category: AnswerCategory
  /** Restricts the answer to these control types. Empty means any compatible control. */
  controlTypes: FieldType[]
  context: AnswerContext
  tags: string[]
  preferred: boolean
  source: AnswerSource
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  usageCount: number
}

type AnswerRecordDefaults =
  | 'aliases'
  | 'controlTypes'
  | 'context'
  | 'tags'
  | 'preferred'
  | 'source'
  | 'lastUsedAt'
  | 'usageCount'

/** An answer as accepted by `parse`: fields with defaults may be omitted. */
export type AnswerRecordInput = Omit<AnswerRecord, AnswerRecordDefaults> & {
  aliases?: AnswerAlias[] | undefined
  controlTypes?: FieldType[] | undefined
  context?: Partial<AnswerContext> | undefined
  tags?: string[] | undefined
  preferred?: boolean | undefined
  source?: AnswerSource | undefined
  lastUsedAt?: number | null | undefined
  usageCount?: number | undefined
}

export const answerRecordSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  semanticKey: z.string().max(120).nullable(),
  aliases: z.array(answerAliasSchema).max(100).default([]),
  value: answerValueSchema,
  profileId: z.string().max(100).nullable(),
  category: answerCategorySchema,
  controlTypes: z.array(fieldTypeSchema).max(30).default([]),
  context: answerContextSchema.prefault({}),
  tags: z.array(z.string().min(1).max(50)).max(30).default([]),
  preferred: z.boolean().default(false),
  source: z.enum(ANSWER_SOURCES).default('manual'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().nullable().default(null),
  usageCount: z.number().int().nonnegative().default(0),
})

export const PROFILE_KINDS = ['general', 'role', 'custom'] as const
export type ProfileKind = (typeof PROFILE_KINDS)[number]

export interface Profile {
  id: string
  name: string
  description: string
  kind: ProfileKind
  isDefault: boolean
  /** Blank template the profile was created from; decides which fields its editor lists. */
  templateId: string | null
  createdAt: number
  updatedAt: number
}

export const profileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).default(''),
  kind: z.enum(PROFILE_KINDS).default('custom'),
  isDefault: z.boolean().default(false),
  templateId: z.string().max(100).nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const CUSTOM_FIELD_KEY_PATTERN = /^custom:[a-z0-9-]{1,100}$/

/**
 * A field the user defined because the catalog has no key for it, such as "Preferred office".
 * Answers point at it through `semanticKey`, and matching treats its aliases like catalog aliases.
 */
export interface CustomFieldDefinition {
  /** `custom:<slug>`, derived from the first label and kept when the label changes. */
  key: string
  label: string
  description: string
  category: AnswerCategory
  aliases: AnswerAlias[]
  /** Preferred control types. Empty means any compatible control. */
  controlTypes: FieldType[]
  createdAt: number
  updatedAt: number
}

export const customFieldSchema = z.object({
  key: z.string().regex(CUSTOM_FIELD_KEY_PATTERN),
  label: z.string().trim().min(1).max(300),
  description: z.string().max(500).default(''),
  category: answerCategorySchema.default('custom'),
  aliases: z.array(answerAliasSchema).max(100).default([]),
  controlTypes: z.array(fieldTypeSchema).max(30).default([]),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

/** A user-confirmed binding between a field on a site and a specific answer. Highest matching priority. */
export interface FieldMapping {
  id: string
  site: string
  /** `normalizedLabel|fieldType`, so the mapping survives re-renders that change element ids. */
  fieldSignature: string
  answerId: string
  profileId: string | null
  createdAt: number
}

export const fieldMappingSchema = z.object({
  id: z.string().min(1).max(100),
  site: z.string().min(1).max(253),
  fieldSignature: z.string().min(1).max(1_100),
  answerId: z.string().min(1).max(100),
  profileId: z.string().max(100).nullable(),
  createdAt: z.number().int().nonnegative(),
})

export function describeAnswerValue(value: AnswerValue): string {
  switch (value.kind) {
    case 'text':
      return value.text
    case 'boolean':
      return value.value ? 'Yes' : 'No'
    case 'list':
      return value.items.join(', ')
  }
}
