import { z } from 'zod'

export const AUTOFILL_MODES = ['suggest', 'review', 'trusted'] as const
/**
 * `suggest`: show matches, never change the page.
 * `review` (default): the user selects fields and confirms before filling.
 * `trusted`: high-confidence saved values on allowed sites may be filled in one action.
 */
export type AutofillMode = (typeof AUTOFILL_MODES)[number]
export const autofillModeSchema = z.enum(AUTOFILL_MODES)

export const SYNTHETIC_CATEGORIES = [
  'name',
  'email',
  'phone',
  'address',
  'text',
  'number',
  'date',
  'url',
  'identifier',
  'select-option',
  'checkbox',
] as const
export type SyntheticCategory = (typeof SYNTHETIC_CATEGORIES)[number]
export const syntheticCategorySchema = z.enum(SYNTHETIC_CATEGORIES)

export interface ConfidenceThresholds {
  high: number
  medium: number
}

export const confidenceThresholdsSchema = z
  .object({
    high: z.number().min(0).max(1).default(0.9),
    medium: z.number().min(0).max(1).default(0.7),
  })
  .refine((value) => value.high > value.medium, {
    message: 'The high threshold must be greater than the medium threshold.',
  })

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = Object.freeze({ high: 0.9, medium: 0.7 })

export interface TrustedModeSettings {
  minConfidence: number
  /** Hostnames where trusted mode may fill without per-field selection. */
  sites: string[]
}

export interface LearningSettings {
  /** Global switch; capture is still armed per page from the panel. */
  allowed: boolean
}

export interface SyntheticSettings {
  enabled: boolean
  seed: string | null
  allowedCategories: SyntheticCategory[]
  /** Normalized labels of fields that may receive generated values. */
  fieldAllowlist: string[]
  /** Category -> generator id. */
  generatorOverrides: Record<string, string>
}

export interface ClearSettings {
  includeSelects: boolean
  includeChoiceControls: boolean
}

export interface DiagnosticsSettings {
  enabled: boolean
}

export interface AutofillSettings {
  mode: AutofillMode
  activeProfileId: string | null
  thresholds: ConfidenceThresholds
  /** Never overwrite fields that already hold a value unless this is enabled. */
  overwriteExisting: boolean
  autoRescan: boolean
  trusted: TrustedModeSettings
  learning: LearningSettings
  synthetic: SyntheticSettings
  clear: ClearSettings
  diagnostics: DiagnosticsSettings
}

type Optional<T> = { [K in keyof T]?: T[K] | undefined }

/** Settings as accepted by `parse`: every field and section is optional and filled from defaults. */
export type AutofillSettingsInput = {
  mode?: AutofillMode | undefined
  activeProfileId?: string | null | undefined
  thresholds?: Optional<ConfidenceThresholds> | undefined
  overwriteExisting?: boolean | undefined
  autoRescan?: boolean | undefined
  trusted?: Optional<TrustedModeSettings> | undefined
  learning?: Optional<LearningSettings> | undefined
  synthetic?: Optional<SyntheticSettings> | undefined
  clear?: Optional<ClearSettings> | undefined
  diagnostics?: Optional<DiagnosticsSettings> | undefined
}

export const autofillSettingsSchema = z.object({
  mode: autofillModeSchema.default('review'),
  activeProfileId: z.string().max(100).nullable().default(null),
  thresholds: confidenceThresholdsSchema.prefault({}),
  overwriteExisting: z.boolean().default(false),
  autoRescan: z.boolean().default(true),
  trusted: z
    .object({
      minConfidence: z.number().min(0.5).max(1).default(0.9),
      sites: z.array(z.string().min(1).max(253)).max(200).default([]),
    })
    .prefault({}),
  learning: z
    .object({
      allowed: z.boolean().default(true),
    })
    .prefault({}),
  synthetic: z
    .object({
      enabled: z.boolean().default(false),
      seed: z.string().max(100).nullable().default(null),
      allowedCategories: z.array(syntheticCategorySchema).default([]),
      fieldAllowlist: z.array(z.string().min(1).max(300)).max(500).default([]),
      generatorOverrides: z.record(z.string(), z.string()).default({}),
    })
    .prefault({}),
  clear: z
    .object({
      includeSelects: z.boolean().default(true),
      includeChoiceControls: z.boolean().default(false),
    })
    .prefault({}),
  diagnostics: z
    .object({
      enabled: z.boolean().default(false),
    })
    .prefault({}),
})

export function createDefaultSettings(): AutofillSettings {
  return autofillSettingsSchema.parse({})
}
