import {
  PLUGIN_API_VERSION,
  labelSimilarity,
  normalizeLabel,
  semanticKeyLabel,
  tokenize,
  type AnswerRecord,
  type FieldDescriptor,
  type MatchingStrategy,
  type StrategyCandidate,
} from '@ufa/core'

import { siteMatches } from './context'

/**
 * Base scores of the built-in strategies. Fuzzy and suggestion are capped below the default high
 * threshold: resemblance alone never proves two labels mean the same thing.
 */
export const STRATEGY_SCORES = {
  explicitMapping: 1,
  exactLabel: 0.95,
  alias: 0.92,
  contextExact: 0.9,
  contextPartial: 0.8,
  fuzzyMax: 0.85,
  fuzzyFactor: 0.9,
  suggestionBase: 0.35,
  suggestionRange: 0.25,
} as const

export const FUZZY_MIN_SIMILARITY = 0.6

/** Words too common to suggest a relationship on their own. */
const COMMON_WORDS = new Set([
  'a',
  'an',
  'and',
  'any',
  'are',
  'do',
  'does',
  'for',
  'have',
  'how',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'name',
  'no',
  'of',
  'on',
  'or',
  'other',
  'the',
  'to',
  'we',
  'what',
  'when',
  'where',
  'which',
  'why',
  'with',
  'yes',
  'you',
])

interface Labelled {
  answer: AnswerRecord
  label: string
  /** Normalized label first, then normalized aliases. */
  phrases: { text: string; display: string }[]
}

interface AnswerIndex {
  byId: Map<string, AnswerRecord>
  byKey: Map<string, AnswerRecord[]>
  byPhrase: Map<string, { answer: AnswerRecord; alias: string | null }[]>
  byToken: Map<string, Set<Labelled>>
  labelled: Labelled[]
}

const indexes = new WeakMap<readonly AnswerRecord[], AnswerIndex>()

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** Lookup tables for one answer list, built once and reused for every field. */
export function indexAnswers(answers: readonly AnswerRecord[]): AnswerIndex {
  const cached = indexes.get(answers)
  if (cached) return cached
  const index: AnswerIndex = {
    byId: new Map(),
    byKey: new Map(),
    byPhrase: new Map(),
    byToken: new Map(),
    labelled: [],
  }
  for (const answer of answers) {
    index.byId.set(answer.id, answer)
    if (answer.semanticKey) push(index.byKey, answer.semanticKey, answer)
    const label = normalizeLabel(answer.label)
    const phrases = [
      ...(label ? [{ text: label, display: answer.label }] : []),
      ...answer.aliases
        .map((alias) => ({
          text: alias.normalized || normalizeLabel(alias.text),
          display: alias.text,
        }))
        .filter((alias) => alias.text && alias.text !== label),
    ]
    if (label) push(index.byPhrase, label, { answer, alias: null })
    for (const alias of phrases.slice(label ? 1 : 0))
      push(index.byPhrase, alias.text, { answer, alias: alias.display })
    const labelled: Labelled = { answer, label, phrases }
    index.labelled.push(labelled)
    for (const phrase of phrases) {
      for (const token of tokenize(phrase.text)) {
        if (COMMON_WORDS.has(token)) continue
        let set = index.byToken.get(token)
        if (!set) index.byToken.set(token, (set = new Set()))
        set.add(labelled)
      }
    }
  }
  indexes.set(answers, index)
  return index
}

const round = (value: number) => Math.round(value * 1000) / 1000
const quote = (text: string) => `"${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`

/** Field signature used by explicit mappings: survives re-renders that change element ids. */
export function fieldSignature(field: Pick<FieldDescriptor, 'normalizedLabel' | 'type'>): string {
  return `${field.normalizedLabel}|${field.type}`
}

const base = { apiVersion: PLUGIN_API_VERSION } as const

/** 1. The user linked this field on this site to a specific answer. */
export const explicitMappingStrategy: MatchingStrategy = {
  ...base,
  id: 'ufa.explicit-mapping',
  order: 10,
  match(field, answers, context) {
    const signature = fieldSignature(field)
    const { byId } = indexAnswers(answers)
    return context.mappings.flatMap((mapping): StrategyCandidate[] => {
      if (mapping.fieldSignature !== signature || !siteMatches(context.site, mapping.site))
        return []
      if (mapping.profileId !== null && mapping.profileId !== context.activeProfileId) return []
      const answer = byId.get(mapping.answerId)
      if (!answer) return []
      return [
        {
          answerId: answer.id,
          score: STRATEGY_SCORES.explicitMapping,
          explanation: `You linked this field to ${quote(answer.label)} on ${mapping.site}`,
        },
      ]
    })
  },
}

/** Confidence of a semantic-key match, from how sure the field classification is. */
export function semanticScore(classificationConfidence: number): number {
  return round(0.5 + 0.5 * Math.min(1, Math.max(0, classificationConfidence)))
}

/** 2. The field and the answer are the same kind of information (both "email", say). */
export const semanticKeyStrategy: MatchingStrategy = {
  ...base,
  id: 'ufa.semantic-key',
  order: 20,
  match(field, answers) {
    if (!field.semanticKey) return []
    const matches = indexAnswers(answers).byKey.get(field.semanticKey) ?? []
    const score = semanticScore(field.semanticConfidence)
    const how = field.semanticReason ? ` from its ${field.semanticReason}` : ''
    return matches.map((answer) => ({
      answerId: answer.id,
      score,
      explanation: `Recognized as ${semanticKeyLabel(field.semanticKey)}${how}`,
    }))
  },
}

/** 3. The field's label is the answer's label. */
export const exactLabelStrategy: MatchingStrategy = {
  ...base,
  id: 'ufa.exact-label',
  order: 30,
  match(field, answers) {
    if (!field.normalizedLabel) return []
    const hits = indexAnswers(answers).byPhrase.get(field.normalizedLabel) ?? []
    return hits
      .filter((hit) => hit.alias === null)
      .map((hit) => ({
        answerId: hit.answer.id,
        score: STRATEGY_SCORES.exactLabel,
        explanation: `Same label as your answer ${quote(hit.answer.label)}`,
      }))
  },
}

/** 4. The field's label is one of the answer's other labels. */
export const aliasStrategy: MatchingStrategy = {
  ...base,
  id: 'ufa.alias',
  order: 40,
  match(field, answers) {
    if (!field.normalizedLabel) return []
    const hits = indexAnswers(answers).byPhrase.get(field.normalizedLabel) ?? []
    return hits.flatMap((hit) =>
      hit.alias === null
        ? []
        : [
            {
              answerId: hit.answer.id,
              score: STRATEGY_SCORES.alias,
              explanation: `Matches ${quote(hit.alias)}, another label of ${quote(hit.answer.label)}`,
            },
          ],
    )
  },
}

/**
 * 5. The label alone is too short, but with its section or form title it reads as the answer:
 * "Name" under "Emergency contact" matches an answer labelled "Emergency contact name".
 */
export const contextStrategy: MatchingStrategy = {
  ...base,
  id: 'ufa.context',
  order: 50,
  match(field, answers) {
    const label = field.normalizedLabel
    if (!label) return []
    const scopes = [field.section, field.formTitle]
      .map((scope) => ({ raw: scope, text: normalizeLabel(scope) }))
      .filter((scope): scope is { raw: string; text: string } => Boolean(scope.raw && scope.text))
    if (scopes.length === 0) return []
    const labelTokens = new Set(tokenize(label))
    const index = indexAnswers(answers)
    const results = new Map<string, StrategyCandidate>()
    for (const scope of scopes) {
      const combined = normalizeLabel(`${scope.raw} ${field.label}`)
      for (const hit of index.byPhrase.get(combined) ?? []) {
        if (results.has(hit.answer.id)) continue
        results.set(hit.answer.id, {
          answerId: hit.answer.id,
          score: STRATEGY_SCORES.contextExact,
          explanation: `${quote(field.label)} under ${quote(scope.raw)} reads as ${quote(hit.alias ?? hit.answer.label)}`,
        })
      }
      const available = new Set([...labelTokens, ...tokenize(scope.text)])
      for (const entry of index.labelled) {
        if (results.has(entry.answer.id)) continue
        for (const phrase of entry.phrases) {
          const tokens = tokenize(phrase.text)
          if (tokens.length < 2 || !tokens.every((token) => available.has(token))) continue
          if (![...labelTokens].every((token) => tokens.includes(token))) continue
          if (tokens.every((token) => labelTokens.has(token))) continue
          results.set(entry.answer.id, {
            answerId: entry.answer.id,
            score: STRATEGY_SCORES.contextPartial,
            explanation: `${quote(field.label)} with ${quote(scope.raw)} covers ${quote(phrase.display)}`,
          })
          break
        }
      }
    }
    return [...results.values()]
  },
}

function candidatesSharingTokens(label: string, index: AnswerIndex): Set<Labelled> {
  const found = new Set<Labelled>()
  for (const token of tokenize(label)) {
    if (COMMON_WORDS.has(token)) continue
    for (const entry of index.byToken.get(token) ?? []) found.add(entry)
  }
  return found
}

/** 6. The labels resemble each other. A hint only: capped below the high threshold. */
export const fuzzyStrategy: MatchingStrategy = {
  ...base,
  id: 'ufa.fuzzy',
  order: 60,
  match(field, answers) {
    const label = field.normalizedLabel
    if (!label) return []
    const index = indexAnswers(answers)
    const pool =
      index.labelled.length <= 200 ? index.labelled : candidatesSharingTokens(label, index)
    const results: StrategyCandidate[] = []
    for (const entry of pool) {
      let best = { similarity: 0, display: '' }
      for (const phrase of entry.phrases) {
        const similarity = labelSimilarity(label, phrase.text)
        if (similarity > best.similarity) best = { similarity, display: phrase.display }
      }
      if (best.similarity < FUZZY_MIN_SIMILARITY || best.similarity >= 1) continue
      results.push({
        answerId: entry.answer.id,
        score: round(
          Math.min(STRATEGY_SCORES.fuzzyMax, best.similarity * STRATEGY_SCORES.fuzzyFactor),
        ),
        explanation: `Label resembles ${quote(best.display)} (${Math.round(best.similarity * 100)}% alike)`,
      })
    }
    return results
  },
}

/** 7. The labels share a distinctive word. Shown to the user as a possibility, never filled on trust. */
export const suggestionStrategy: MatchingStrategy = {
  ...base,
  id: 'ufa.suggestion',
  order: 70,
  match(field, answers) {
    const label = field.normalizedLabel
    if (!label) return []
    const fieldTokens = new Set(tokenize(label).filter((token) => !COMMON_WORDS.has(token)))
    if (fieldTokens.size === 0) return []
    const results: StrategyCandidate[] = []
    for (const entry of candidatesSharingTokens(label, indexAnswers(answers))) {
      const tokens = new Set(
        entry.phrases
          .flatMap((phrase) => tokenize(phrase.text))
          .filter((token) => !COMMON_WORDS.has(token)),
      )
      const shared = [...fieldTokens].filter((token) => tokens.has(token))
      if (shared.length === 0) continue
      const overlap = shared.length / new Set([...fieldTokens, ...tokens]).size
      results.push({
        answerId: entry.answer.id,
        score: round(STRATEGY_SCORES.suggestionBase + STRATEGY_SCORES.suggestionRange * overlap),
        explanation: `Shares the word${shared.length === 1 ? '' : 's'} ${shared.map((token) => `"${token}"`).join(', ')}`,
      })
    }
    return results
  },
}

/** The built-in strategies in the order the engine consults them. */
export const BUILTIN_STRATEGIES: readonly MatchingStrategy[] = [
  explicitMappingStrategy,
  semanticKeyStrategy,
  exactLabelStrategy,
  aliasStrategy,
  contextStrategy,
  fuzzyStrategy,
  suggestionStrategy,
]

/** Highest score each built-in strategy may produce after context bonuses. */
export const STRATEGY_CAPS: Readonly<Record<string, number>> = {
  [fuzzyStrategy.id]: STRATEGY_SCORES.fuzzyMax,
  [suggestionStrategy.id]: STRATEGY_SCORES.suggestionBase + STRATEGY_SCORES.suggestionRange,
}
