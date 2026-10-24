import {
  normalizeLabel,
  type AutofillSettings,
  type FieldDescriptor,
  type GeneratorProvider,
  type SyntheticGenerationResult,
} from '@ufa/core'

import { GENERATION_BLOCKED_SEMANTIC_KEYS } from './blocked'
import { syntheticCategoryFor } from './category'
import { BUILTIN_GENERATORS } from './builtin'
import { createGeneratorContext } from './prng'

export interface GenerateOptions {
  generators?: readonly GeneratorProvider[]
  now?: () => number
}

function allowedForField(field: FieldDescriptor, settings: AutofillSettings): string | null {
  if (!settings.synthetic.enabled) return 'Synthetic data is turned off.'
  if (field.sensitivity !== 'normal') return 'This field cannot use generated data.'
  if (field.support !== 'supported') return 'This control is not supported.'
  if (field.semanticKey && GENERATION_BLOCKED_SEMANTIC_KEYS.has(field.semanticKey))
    return 'Factual or legal answers are never generated.'
  const category = syntheticCategoryFor(field)
  if (!category) return 'No generator fits this control.'
  if (!settings.synthetic.allowedCategories.includes(category))
    return 'This category is not allowed for generation.'
  const label = normalizeLabel(field.label)
  const allowlist = settings.synthetic.fieldAllowlist.map(normalizeLabel).filter(Boolean)
  if (allowlist.length > 0 && !allowlist.includes(label))
    return 'This field is not on the generation allowlist.'
  return null
}

function pickGenerator(
  field: FieldDescriptor,
  category: NonNullable<ReturnType<typeof syntheticCategoryFor>>,
  settings: AutofillSettings,
  generators: readonly GeneratorProvider[],
): GeneratorProvider | null {
  const override = settings.synthetic.generatorOverrides[category]
  const ordered = [
    ...(override ? generators.filter((entry) => entry.id === override) : []),
    ...generators,
  ]
  return ordered.find((entry) => entry.supports(field, category)) ?? null
}

/** Builds one ephemeral generated value; never persisted as a saved answer. */
export function generateForField(
  field: FieldDescriptor,
  settings: AutofillSettings,
  options: GenerateOptions = {},
): SyntheticGenerationResult | null {
  const refusal = allowedForField(field, settings)
  if (refusal) return null
  const category = syntheticCategoryFor(field)
  if (!category) return null
  const generators = options.generators ?? BUILTIN_GENERATORS
  const generator = pickGenerator(field, category, settings, generators)
  if (!generator) return null
  const ctx = createGeneratorContext(settings.synthetic.seed, options.now)
  const value = generator.generate(field, ctx)
  if (!value) return null
  return {
    fieldId: field.id,
    generatorId: generator.id,
    value,
    source: 'generated',
    valid: true,
    validationMessage: null,
    seed: ctx.seed,
  }
}

export function generateForFields(
  fields: readonly FieldDescriptor[],
  settings: AutofillSettings,
  options: GenerateOptions = {},
): SyntheticGenerationResult[] {
  const results: SyntheticGenerationResult[] = []
  for (const field of fields) {
    const result = generateForField(field, settings, options)
    if (result) results.push(result)
  }
  return results
}
