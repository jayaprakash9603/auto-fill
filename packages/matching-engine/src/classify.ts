import {
  PLUGIN_API_VERSION,
  containsPhrase,
  getSemanticCatalog,
  humanizeIdentifier,
  invokePlugin,
  labelSimilarity,
  normalizeLabel,
  tokenize,
  type AnswerCategory,
  type ClassificationInput,
  type CompiledSemanticKey,
  type CustomFieldDefinition,
  type FieldDescriptor,
  type FieldType,
  type SemanticClassification,
  type SemanticClassifier,
} from '@ufa/core'

/** Input types with a value format; a key that declares other types cannot apply to them. */
const FORMAT_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'email',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
])

/** Single words too vague to classify a label that merely contains them ("State your reason"). */
const VAGUE_WORDS = new Set([
  'about',
  'address',
  'bio',
  'comment',
  'comments',
  'date',
  'first',
  'last',
  'message',
  'name',
  'notes',
  'number',
  'other',
  'referral',
  'regarding',
  'source',
  'state',
  'subject',
  'title',
  'topic',
  'type',
])

const IGNORED_AUTOCOMPLETE = new Set(['on', 'off'])

/**
 * Sections and labels about someone else: their name, email or phone is not the user's, so
 * personal, contact and address keys must not apply there.
 */
const OTHER_PERSON =
  /\b(emergency|references?|referees?|next of kin|kin|spouses?|partners?|parents?|guardians?|fathers?|mothers?|supervisors?|managers?|recommenders?|referrers?)\b/
export const PERSONAL_CATEGORIES: ReadonlySet<AnswerCategory> = new Set<AnswerCategory>([
  'personal',
  'contact',
  'address',
])

/** Whether the field asks about another person (an emergency contact, a referee…). */
export function isAboutAnotherPerson(
  input: Pick<ClassificationInput, 'section' | 'label'>,
): boolean {
  return OTHER_PERSON.test(`${normalizeLabel(input.section)} ${normalizeLabel(input.label)}`)
}

/**
 * Classification confidence per rule. A semantic-key match scores 0.5 + 0.5 × this, so only
 * rules at 0.8 or above can reach the default high threshold. Labels that merely contain a
 * known phrase ("Describe your work experience") stay below it and are only suggested.
 */
export const CONFIDENCE = {
  autocomplete: 0.98,
  exactLabel: 0.95,
  identifier: 0.88,
  hint: 0.9,
  contains: 0.75,
  containsWord: 0.65,
  inputType: 0.85,
  /** Multiplied by the similarity, so fuzzy classification stays below 0.75. */
  fuzzy: 0.75,
} as const

const FUZZY_MIN_SIMILARITY = 0.82
const FUZZY_MIN_MARGIN = 0.08

function typeFits(entry: { types?: readonly FieldType[] | undefined }, type: FieldType): boolean {
  if (!FORMAT_TYPES.has(type) || !entry.types?.length) return true
  return entry.types.includes(type)
}

/** Whether a label containing `phrase` as whole words is good evidence for it. */
function isDistinctivePhrase(phrase: string): boolean {
  const words = tokenize(phrase)
  if (words.length >= 2) return true
  const [word] = words
  return Boolean(word && word.length >= 3 && !VAGUE_WORDS.has(word))
}

interface Phrase {
  key: string
  phrase: string
}

/** The longest distinctive phrase contained in `text`, or null when two keys tie. */
function longestContained(text: string, phrases: readonly Phrase[]): Phrase | null {
  let best: Phrase | null = null
  let tie = false
  for (const candidate of phrases) {
    if (!isDistinctivePhrase(candidate.phrase) || !containsPhrase(text, candidate.phrase)) continue
    if (!best || candidate.phrase.length > best.phrase.length) {
      best = candidate
      tie = false
    } else if (candidate.phrase.length === best.phrase.length && candidate.key !== best.key) {
      tie = true
    }
  }
  return tie ? null : best
}

/** Exactly one key owns `text` among `phrases`; several owners make it ambiguous. */
function uniqueOwner(text: string, phrases: readonly Phrase[]): string | null {
  const owners = new Set(phrases.filter((entry) => entry.phrase === text).map((entry) => entry.key))
  return owners.size === 1 ? [...owners][0]! : null
}

const quote = (text: string) => `"${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`

interface ClassifierEntry {
  key: string
  phrases: readonly string[]
  category?: AnswerCategory
  autocomplete?: readonly string[]
  identifierPatterns?: readonly RegExp[]
  types?: readonly FieldType[] | undefined
}

function classifyAgainst(
  input: ClassificationInput,
  entries: readonly ClassifierEntry[],
  options: { inputTypeHints: boolean },
): SemanticClassification | null {
  const someoneElse = isAboutAnotherPerson(input)
  const fitting = entries.filter(
    (entry) =>
      typeFits(entry, input.type) &&
      !(someoneElse && entry.category && PERSONAL_CATEGORIES.has(entry.category)),
  )
  if (fitting.length === 0) return null
  const phrases: Phrase[] = fitting.flatMap((entry) =>
    entry.phrases.map((phrase) => ({ key: entry.key, phrase })),
  )
  const label = input.normalizedLabel
  const checkbox = input.type === 'checkbox'

  const tokens = (input.autocomplete ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token && !IGNORED_AUTOCOMPLETE.has(token))
  for (const entry of fitting) {
    const token = entry.autocomplete?.find((candidate) => tokens.includes(candidate))
    if (token)
      return {
        key: entry.key,
        confidence: CONFIDENCE.autocomplete,
        reason: `autocomplete="${token}"`,
      }
  }

  if (label) {
    const owner = uniqueOwner(label, phrases)
    if (owner)
      return {
        key: owner,
        confidence: CONFIDENCE.exactLabel,
        reason: `label ${quote(input.label)}`,
      }
  }

  for (const identifier of [input.name, input.htmlId]) {
    if (!identifier) continue
    const words = normalizeLabel(humanizeIdentifier(identifier))
    if (!words) continue
    const entry = fitting.find((candidate) =>
      candidate.identifierPatterns?.some((pattern) => pattern.test(words)),
    )
    if (entry)
      return {
        key: entry.key,
        confidence: CONFIDENCE.identifier,
        reason: `field name ${quote(identifier)}`,
      }
    const owner = uniqueOwner(words, phrases)
    if (owner)
      return {
        key: owner,
        confidence: CONFIDENCE.identifier,
        reason: `field name ${quote(identifier)}`,
      }
  }

  for (const hint of [input.placeholder]) {
    const normalized = normalizeLabel(hint)
    if (!normalized || normalized === label) continue
    const owner = uniqueOwner(normalized, phrases)
    if (owner)
      return { key: owner, confidence: CONFIDENCE.hint, reason: `placeholder ${quote(hint!)}` }
  }

  if (checkbox) return null

  if (label) {
    const contained = longestContained(label, phrases)
    if (contained)
      return {
        key: contained.key,
        confidence:
          tokenize(contained.phrase).length > 1 ? CONFIDENCE.contains : CONFIDENCE.containsWord,
        reason: `label mentions "${contained.phrase}"`,
      }
  }

  if (options.inputTypeHints) {
    if (input.type === 'email' && fitting.some((entry) => entry.key === 'email'))
      return { key: 'email', confidence: CONFIDENCE.inputType, reason: 'email input' }
    if (input.type === 'tel' && fitting.some((entry) => entry.key === 'phone'))
      return { key: 'phone', confidence: CONFIDENCE.inputType, reason: 'phone input' }
  }

  if (label) {
    const bestByKey = new Map<string, { similarity: number; phrase: string }>()
    for (const { key, phrase } of phrases) {
      const similarity = labelSimilarity(label, phrase)
      if (similarity > (bestByKey.get(key)?.similarity ?? 0))
        bestByKey.set(key, { similarity, phrase })
    }
    const ranked = [...bestByKey.entries()].sort((a, b) => b[1].similarity - a[1].similarity)
    const [first, second] = ranked
    if (
      first &&
      first[1].similarity >= FUZZY_MIN_SIMILARITY &&
      first[1].similarity - (second?.[1].similarity ?? 0) >= FUZZY_MIN_MARGIN
    ) {
      return {
        key: first[0],
        confidence: round(CONFIDENCE.fuzzy * first[1].similarity),
        reason: `label resembles "${first[1].phrase}"`,
      }
    }
  }
  return null
}

const round = (value: number) => Math.round(value * 1000) / 1000

const catalogEntries = (catalog: readonly CompiledSemanticKey[]): ClassifierEntry[] =>
  catalog.map((entry) => ({
    key: entry.key,
    phrases: entry.normalizedAliases,
    category: entry.category,
    autocomplete: entry.autocomplete ?? [],
    identifierPatterns: entry.identifierPatterns ?? [],
    types: entry.types,
  }))

let builtinEntries: ClassifierEntry[] | null = null

/** Classifies fields against the built-in semantic catalog. */
export const catalogClassifier: SemanticClassifier = {
  id: 'ufa.catalog',
  apiVersion: PLUGIN_API_VERSION,
  order: 100,
  classify(input) {
    builtinEntries ??= catalogEntries(getSemanticCatalog())
    return classifyAgainst(input, builtinEntries, { inputTypeHints: true })
  },
}

/** Classifies fields against the user's own custom fields (labels and aliases). */
export function createCustomFieldClassifier(
  customFields: readonly CustomFieldDefinition[],
): SemanticClassifier {
  const entries = customFields.map((field) => ({
    key: field.key,
    phrases: [
      ...new Set(
        [normalizeLabel(field.label), ...field.aliases.map((alias) => alias.normalized)].filter(
          Boolean,
        ),
      ),
    ],
    types: field.controlTypes.length ? field.controlTypes : undefined,
  }))
  return {
    id: 'ufa.custom-fields',
    apiVersion: PLUGIN_API_VERSION,
    order: 50,
    classify(input) {
      const result = classifyAgainst(input, entries, { inputTypeHints: false })
      if (!result) return null
      const field = customFields.find((candidate) => candidate.key === result.key)
      return {
        ...result,
        reason: `${result.reason} (your field ${quote(field?.label ?? result.key)})`,
      }
    },
  }
}

export function classificationInput(field: FieldDescriptor): ClassificationInput {
  return {
    type: field.type,
    label: field.label,
    normalizedLabel: field.normalizedLabel,
    name: field.name,
    htmlId: field.htmlId,
    autocomplete: field.autocomplete,
    placeholder: field.placeholder,
    section: field.section,
    options: field.options,
  }
}

export interface ClassifyOptions {
  /** Ordered classifiers; the most confident result wins and ties go to the earlier one. */
  classifiers: readonly SemanticClassifier[]
  onPluginError?: (pluginId: string, error: unknown) => void
}

/**
 * Picks a semantic key for a field. A key already set with higher confidence (for example by a
 * portal adapter that knows the page) is kept.
 */
export function classifyField(field: FieldDescriptor, options: ClassifyOptions): FieldDescriptor {
  if (field.sensitivity === 'prohibited') return field
  const input = classificationInput(field)
  let best: SemanticClassification | null = null
  for (const classifier of options.classifiers) {
    const result = invokePlugin(
      classifier.id,
      () => classifier.classify(input),
      options.onPluginError ?? (() => {}),
    )
    if (!result || !Number.isFinite(result.confidence)) continue
    const confidence = Math.min(1, Math.max(0, result.confidence))
    if (!best || confidence > best.confidence) best = { ...result, confidence }
  }
  if (!best || (field.semanticKey && field.semanticConfidence >= best.confidence)) return field
  return {
    ...field,
    semanticKey: best.key,
    semanticConfidence: best.confidence,
    semanticReason: best.reason.slice(0, 300),
  }
}

export function classifyFields(
  fields: readonly FieldDescriptor[],
  options: ClassifyOptions,
): FieldDescriptor[] {
  return fields.map((field) => classifyField(field, options))
}
