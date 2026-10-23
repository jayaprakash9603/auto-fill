import {
  describeAnswerValue,
  normalizeLabel,
  normalizeValue,
  semanticKeyLabel,
  type AnswerCategory,
  type AnswerContext,
  type AnswerRecord,
  type AnswerSource,
  type AnswerValue,
  type AutofillSettings,
  type CustomFieldDefinition,
  type Profile,
} from '@ufa/core'

/** What an answer answers: its semantic key, or its normalized label when it has none. */
export function answerKeyOf(answer: Pick<AnswerRecord, 'semanticKey' | 'label'>): string {
  return answer.semanticKey ?? `label:${normalizeLabel(answer.label)}`
}

export function valueKeyOf(value: AnswerValue): string {
  switch (value.kind) {
    case 'text':
      return `text:${normalizeValue(value.text)}`
    case 'boolean':
      return `boolean:${value.value}`
    case 'list':
      return `list:${value.items.map(normalizeValue).sort().join('|')}`
  }
}

export function contextKeyOf(context: AnswerContext): string {
  const part = (values: string[]) =>
    [...values]
      .map((value) => value.toLowerCase())
      .sort()
      .join(',')
  return [
    part(context.sites),
    part(context.sectionKeywords),
    part(context.formKeywords),
    part(context.applicationTypes),
  ].join(';')
}

/** Answers that compete for the same field in the same scope and context. */
export function groupKeyOf(answer: AnswerRecord): string {
  return `${answer.profileId ?? '*'}#${answerKeyOf(answer)}#${contextKeyOf(answer.context)}`
}

export function isContextEmpty(context: AnswerContext): boolean {
  return (
    !context.sites.length &&
    !context.sectionKeywords.length &&
    !context.formKeywords.length &&
    !context.applicationTypes.length
  )
}

/** An existing answer with the same scope, field, context and value, if any. */
export function findDuplicateOf(
  answers: readonly AnswerRecord[],
  candidate: AnswerRecord,
): AnswerRecord | null {
  const group = groupKeyOf(candidate)
  const value = valueKeyOf(candidate.value)
  return (
    answers.find(
      (answer) =>
        answer.id !== candidate.id &&
        groupKeyOf(answer) === group &&
        valueKeyOf(answer.value) === value,
    ) ?? null
  )
}

export interface DuplicateReport {
  /** Groups of answers that are the same answer saved more than once. Safe to merge. */
  duplicates: AnswerRecord[][]
  /** Groups of different answers to the same field in the same scope and context. One should be preferred. */
  conflicts: AnswerRecord[][]
}

export function findDuplicateAnswers(answers: readonly AnswerRecord[]): DuplicateReport {
  const groups = new Map<string, AnswerRecord[]>()
  for (const answer of answers) {
    const key = groupKeyOf(answer)
    groups.set(key, [...(groups.get(key) ?? []), answer])
  }
  const duplicates: AnswerRecord[][] = []
  const conflicts: AnswerRecord[][] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const byValue = new Map<string, AnswerRecord[]>()
    for (const answer of group) {
      const key = valueKeyOf(answer.value)
      byValue.set(key, [...(byValue.get(key) ?? []), answer])
    }
    for (const same of byValue.values()) if (same.length > 1) duplicates.push(same)
    if (byValue.size > 1 && !group.some((answer) => answer.preferred)) conflicts.push(group)
  }
  return { duplicates, conflicts }
}

/** Keeps at most one preferred answer per group; `keep` wins, otherwise the earliest in the list. */
export function enforcePreferred(answers: AnswerRecord[], keep?: string): AnswerRecord[] {
  const winners = new Map<string, string>()
  const kept = keep ? answers.find((answer) => answer.id === keep && answer.preferred) : undefined
  if (kept) winners.set(groupKeyOf(kept), kept.id)
  for (const answer of answers) {
    if (!answer.preferred) continue
    const group = groupKeyOf(answer)
    if (!winners.has(group)) winners.set(group, answer.id)
  }
  return answers.map((answer) =>
    answer.preferred && winners.get(groupKeyOf(answer)) !== answer.id
      ? { ...answer, preferred: false }
      : answer,
  )
}

export function resolveActiveProfile(
  profiles: readonly Profile[],
  settings: AutofillSettings,
): Profile | null {
  return (
    profiles.find((profile) => profile.id === settings.activeProfileId) ??
    profiles.find((profile) => profile.isDefault) ??
    profiles[0] ??
    null
  )
}

/**
 * The answers a profile can use: its own, then global ones. Matching prefers the profile's own
 * answer when both exist for a field.
 */
export function answersForProfile(
  answers: readonly AnswerRecord[],
  profileId: string | null,
): AnswerRecord[] {
  const own = profileId ? answers.filter((answer) => answer.profileId === profileId) : []
  return [...own, ...answers.filter((answer) => answer.profileId === null)]
}

/** The answer a profile editor shows for a field: the preferred one without context rules. */
export function answerForKey(
  answers: readonly AnswerRecord[],
  profileId: string | null,
  semanticKey: string,
): AnswerRecord | null {
  const candidates = answers.filter(
    (answer) =>
      answer.profileId === profileId &&
      answer.semanticKey === semanticKey &&
      isContextEmpty(answer.context),
  )
  return candidates.find((answer) => answer.preferred) ?? candidates[0] ?? null
}

export type AnswerScope = 'all' | 'global' | { profileId: string }
export type AnswerSort = 'label' | 'recent' | 'usage'

export interface AnswerQuery {
  /** Every word must appear in the label, aliases, field name, tags or value. */
  text?: string
  /** Defaults to every answer. `{ profileId }` means that profile's own answers only. */
  scope?: AnswerScope
  category?: AnswerCategory | null
  tag?: string | null
  source?: AnswerSource | null
  sort?: AnswerSort
}

function fieldLabel(semanticKey: string | null, customFields: readonly CustomFieldDefinition[]) {
  if (!semanticKey) return ''
  return (
    customFields.find((field) => field.key === semanticKey)?.label ?? semanticKeyLabel(semanticKey)
  )
}

export function queryAnswers(
  answers: readonly AnswerRecord[],
  query: AnswerQuery = {},
  customFields: readonly CustomFieldDefinition[] = [],
): AnswerRecord[] {
  const words = normalizeValue(query.text).split(' ').filter(Boolean)
  const scope = query.scope ?? 'all'
  const tag = query.tag?.toLowerCase() ?? null
  const matches = answers.filter((answer) => {
    if (scope === 'global' && answer.profileId !== null) return false
    if (typeof scope === 'object' && answer.profileId !== scope.profileId) return false
    if (query.category && answer.category !== query.category) return false
    if (query.source && answer.source !== query.source) return false
    if (tag && !answer.tags.some((entry) => entry.toLowerCase() === tag)) return false
    if (!words.length) return true
    const haystack = normalizeValue(
      [
        answer.label,
        ...answer.aliases.map((alias) => alias.text),
        fieldLabel(answer.semanticKey, customFields),
        ...answer.tags,
        answer.category,
        describeAnswerValue(answer.value),
      ].join(' '),
    )
    return words.every((word) => haystack.includes(word))
  })
  const sort = query.sort ?? 'label'
  return matches.sort((a, b) => {
    if (sort === 'recent')
      return (
        (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt) ||
        a.label.localeCompare(b.label)
      )
    if (sort === 'usage') return b.usageCount - a.usageCount || a.label.localeCompare(b.label)
    return (
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }) ||
      a.createdAt - b.createdAt
    )
  })
}

/** Every tag in use, case-insensitively unique, in display order. */
export function collectTags(answers: readonly AnswerRecord[]): string[] {
  const tags = new Map<string, string>()
  for (const answer of answers)
    for (const tag of answer.tags)
      if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag)
  return [...tags.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
