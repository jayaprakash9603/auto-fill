import {
  DEFAULT_THRESHOLDS,
  fieldValuesEqual,
  getSemanticCatalog,
  invokePlugin,
  normalizeLabel,
  type AnswerRecord,
  type ConfidenceLevel,
  type ConfidenceThresholds,
  type CustomFieldDefinition,
  type FieldDescriptor,
  type FieldMapping,
  type FieldValue,
  type MatchCandidate,
  type MatchContext,
  type MatchResult,
  type MatchState,
  type MatchingStrategy,
} from '@ufa/core'

import { PERSONAL_CATEGORIES, isAboutAnotherPerson } from './classify'
import { evaluateContext, type ContextEnvironment } from './context'
import { BUILTIN_STRATEGIES, STRATEGY_CAPS, explicitMappingStrategy } from './strategies'
import { toFieldValue } from './values'

export interface MatchInput {
  /** Every saved answer; the engine uses the active profile's own answers and the global ones. */
  answers: readonly AnswerRecord[]
  mappings: readonly FieldMapping[]
  customFields: readonly CustomFieldDefinition[]
  activeProfileId: string | null
  /** Hostname of the page. */
  site: string
  pageTitle?: string | null
  applicationType?: string | null
  thresholds?: ConfidenceThresholds
}

export interface MatchEngineOptions {
  /** Ordered strategies. Defaults to the built-in seven; plugins add to them. */
  strategies?: readonly MatchingStrategy[]
  onPluginError?: (pluginId: string, error: unknown) => void
}

/** Bonus per matched context rule (site, section, form, application type), up to three rules. */
export const CONTEXT_BONUS = 0.02
const MAX_CONTEXT_BONUS = 0.06
/** Scores closer than this count as a tie. */
const TIE = 0.005
const MAX_CANDIDATES = 10

export function confidenceLevel(score: number, thresholds: ConfidenceThresholds): ConfidenceLevel {
  if (score >= thresholds.high) return 'high'
  if (score >= thresholds.medium) return 'medium'
  return 'low'
}

/** The active profile's own answers first, then answers shared by every profile. */
export function visibleAnswers(
  answers: readonly AnswerRecord[],
  profileId: string | null,
): AnswerRecord[] {
  const own = profileId ? answers.filter((answer) => answer.profileId === profileId) : []
  return [...own, ...answers.filter((answer) => answer.profileId === null)]
}

let personalCatalog: { keys: Set<string>; phrases: Set<string> } | null = null

/** Whether an answer holds the user's own personal, contact or address details. */
function isPersonalAnswer(answer: AnswerRecord): boolean {
  if (PERSONAL_CATEGORIES.has(answer.category)) return true
  if (!personalCatalog) {
    const entries = getSemanticCatalog().filter((entry) => PERSONAL_CATEGORIES.has(entry.category))
    personalCatalog = {
      keys: new Set(entries.map((entry) => entry.key)),
      phrases: new Set(entries.flatMap((entry) => entry.normalizedAliases)),
    }
  }
  if (answer.semanticKey && personalCatalog.keys.has(answer.semanticKey)) return true
  const phrases = [normalizeLabel(answer.label), ...answer.aliases.map((alias) => alias.normalized)]
  return phrases.some((phrase) => personalCatalog!.phrases.has(phrase))
}

/** "Emergency contact name" is about someone else even though it is a name. */
function answerAboutAnotherPerson(answer: AnswerRecord): boolean {
  return [answer.label, ...answer.aliases.map((alias) => alias.text)].some((label) =>
    isAboutAnotherPerson({ section: null, label }),
  )
}

const LEVEL_RANK: Readonly<Record<ConfidenceLevel, number>> = { high: 0, medium: 1, low: 2 }
const round = (value: number) => Math.round(value * 1000) / 1000
const clamp = (value: number) => Math.min(1, Math.max(0, value))
const quote = (text: string) => `"${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`

interface Working {
  answer: AnswerRecord
  strategyId: string
  tier: number
  score: number
  level: ConfidenceLevel
  specificity: number
  explanation: string
  fillValue: FieldValue | null
  incompatibility: string | null
  ambiguousOptions: boolean
}

function compareWorking(a: Working, b: Working): number {
  return (
    LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
    a.tier - b.tier ||
    b.score - a.score ||
    b.specificity - a.specificity ||
    Number(b.answer.preferred) - Number(a.answer.preferred) ||
    Number(b.answer.profileId !== null) - Number(a.answer.profileId !== null) ||
    b.answer.usageCount - a.answer.usageCount ||
    (b.answer.lastUsedAt ?? 0) - (a.answer.lastUsedAt ?? 0) ||
    (a.answer.id < b.answer.id ? -1 : a.answer.id > b.answer.id ? 1 : 0)
  )
}

/** Two candidates the ranking cannot separate, offering different values. */
function isTie(a: Working, b: Working): boolean {
  return (
    a.level === b.level &&
    a.tier === b.tier &&
    Math.abs(a.score - b.score) < TIE &&
    a.specificity === b.specificity &&
    a.answer.preferred === b.answer.preferred &&
    (a.answer.profileId !== null) === (b.answer.profileId !== null) &&
    !fieldValuesEqual(a.fillValue, b.fillValue)
  )
}

function toCandidate(working: Working): MatchCandidate {
  return {
    answerId: working.answer.id,
    strategyId: working.strategyId,
    confidence: { score: working.score, level: working.level },
    explanation: working.explanation,
    fillValue: working.fillValue,
    compatible: working.fillValue !== null,
    incompatibilityReason: working.incompatibility,
    profileId: working.answer.profileId,
  }
}

interface Prepared {
  visible: AnswerRecord[]
  byId: Map<string, AnswerRecord>
  context: MatchContext
  environment: ContextEnvironment
  thresholds: ConfidenceThresholds
  strategies: readonly MatchingStrategy[]
  onPluginError: (pluginId: string, error: unknown) => void
}

function sortStrategies(strategies: readonly MatchingStrategy[]): MatchingStrategy[] {
  return [...strategies].sort(
    (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

function prepare(input: MatchInput, options: MatchEngineOptions): Prepared {
  const visible = visibleAnswers(input.answers, input.activeProfileId)
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS
  return {
    visible,
    byId: new Map(visible.map((answer) => [answer.id, answer])),
    context: {
      site: input.site,
      activeProfileId: input.activeProfileId,
      mappings: input.mappings,
      thresholds,
      customFields: input.customFields,
      applicationType: input.applicationType ?? null,
    },
    environment: {
      site: input.site,
      pageTitle: input.pageTitle ?? null,
      applicationType: input.applicationType ?? null,
    },
    thresholds,
    strategies: sortStrategies(options.strategies ?? BUILTIN_STRATEGIES),
    onPluginError: options.onPluginError ?? (() => {}),
  }
}

function result(
  field: FieldDescriptor,
  state: MatchState,
  reason: string | null,
  best: MatchCandidate | null = null,
  candidates: MatchCandidate[] = [],
): MatchResult {
  return { fieldId: field.id, state, best, candidates, reason }
}

function matchPrepared(field: FieldDescriptor, prepared: Prepared): MatchResult {
  if (field.sensitivity === 'prohibited')
    return result(
      field,
      'skipped',
      `Protected field (${field.sensitivityReason ?? 'sensitive'}): never filled.`,
    )
  if (field.support === 'unsupported')
    return result(
      field,
      'unsupported',
      field.unsupportedReason ?? 'This control is not supported yet.',
    )
  if (!field.editable) return result(field, 'skipped', 'The field cannot be edited.')

  const someoneElse = isAboutAnotherPerson(field)
  const seen = new Map<string, Working>()
  prepared.strategies.forEach((strategy, tier) => {
    const found =
      invokePlugin(
        strategy.id,
        () => strategy.match(field, prepared.visible, prepared.context),
        prepared.onPluginError,
      ) ?? []
    for (const candidate of found) {
      if (seen.has(candidate.answerId) || !Number.isFinite(candidate.score)) continue
      const answer = prepared.byId.get(candidate.answerId)
      if (!answer) continue
      const explicit = strategy.id === explicitMappingStrategy.id
      let specificity = 0
      let contextNote: string | null = null
      if (!explicit) {
        if (answer.controlTypes.length && !answer.controlTypes.includes(field.type)) continue
        if (someoneElse && isPersonalAnswer(answer) && !answerAboutAnotherPerson(answer)) continue
        const fit = evaluateContext(answer.context, field, prepared.environment)
        if (!fit.applies) continue
        specificity = fit.matched.length
        contextNote = fit.reason
      }
      const cap = STRATEGY_CAPS[strategy.id] ?? 1
      const strategyScore = Math.min(
        cap,
        clamp(candidate.score) + Math.min(MAX_CONTEXT_BONUS, CONTEXT_BONUS * specificity),
      )
      const conversion = toFieldValue(answer.value, field)
      const score = round(conversion.ok ? strategyScore * conversion.score : strategyScore)
      const level = confidenceLevel(score, prepared.thresholds)
      if (!conversion.ok && level === 'low') continue
      seen.set(answer.id, {
        answer,
        strategyId: strategy.id,
        tier,
        score,
        level,
        specificity,
        explanation: [candidate.explanation, contextNote, conversion.ok ? conversion.note : null]
          .filter(Boolean)
          .join('; '),
        fillValue: conversion.ok ? conversion.value : null,
        incompatibility: conversion.ok ? null : conversion.reason,
        ambiguousOptions: !conversion.ok && conversion.ambiguous,
      })
    }
  })

  const all = [...seen.values()].sort(compareWorking)
  const compatible = all.filter((entry) => entry.fillValue !== null)
  const incompatible = all.filter((entry) => entry.fillValue === null)
  const candidates = [...compatible, ...incompatible].slice(0, MAX_CANDIDATES).map(toCandidate)
  const label = field.label || 'this field'

  const [top, runnerUp] = compatible
  if (top) {
    if (runnerUp && isTie(top, runnerUp)) {
      const tied = compatible.filter((entry) => isTie(top, entry) || entry === top).length
      return result(
        field,
        'ambiguous',
        `${tied} saved answers fit ${quote(label)} equally well. Choose one.`,
        null,
        candidates,
      )
    }
    return result(
      field,
      top.level === 'high' ? 'matched' : 'suggested',
      null,
      toCandidate(top),
      candidates,
    )
  }
  const [blocked] = incompatible
  if (blocked) {
    return result(
      field,
      blocked.ambiguousOptions ? 'ambiguous' : 'incompatible',
      `Your answer ${quote(blocked.answer.label)} does not fit: ${blocked.incompatibility}`,
      null,
      candidates,
    )
  }
  return result(field, 'missing', `No saved answer fits ${quote(label)}.`)
}

/** Matches one field against the saved answers. Deterministic for the same inputs. */
export function matchField(
  field: FieldDescriptor,
  input: MatchInput,
  options: MatchEngineOptions = {},
): MatchResult {
  return matchPrepared(field, prepare(input, options))
}

/** Matches every field, sharing the answer index between them. */
export function matchFields(
  fields: readonly FieldDescriptor[],
  input: MatchInput,
  options: MatchEngineOptions = {},
): MatchResult[] {
  const prepared = prepare(input, options)
  return fields.map((field) => matchPrepared(field, prepared))
}
