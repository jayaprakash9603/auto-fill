import {
  AutofillError,
  answerRecordSchema,
  answerValueSchema,
  customFieldSchema,
  getProfileTemplate,
  getSemanticCatalog,
  getSemanticKey,
  isCustomSemanticKey,
  normalizeLabel,
  prohibitedAnswerReason,
  semanticKeyLabel,
  type AnswerAlias,
  type AnswerCategory,
  type AnswerContext,
  type AnswerRecord,
  type AnswerSource,
  type AnswerValue,
  type CustomFieldDefinition,
  type FieldType,
  type Profile,
  type ProfileKind,
} from '@ufa/core'

import type { AutofillData } from './keys'

export interface ProfileDraft {
  name: string
  description?: string
  kind?: ProfileKind
  /** One of `PROFILE_TEMPLATES`; decides the fields the profile editor lists. */
  templateId?: string | null
}

export type ProfilePatch = Partial<ProfileDraft>

export interface AnswerDraft {
  label: string
  value: AnswerValue
  /** A catalog key such as "email", a custom field key, or null for a free-standing answer. */
  semanticKey?: string | null
  /** `null` (the default) saves the answer for every profile. */
  profileId?: string | null
  /** Defaults to the field's category. */
  category?: AnswerCategory
  /** Other labels this answer should match. */
  aliases?: readonly string[]
  controlTypes?: readonly FieldType[]
  context?: Partial<AnswerContext>
  tags?: readonly string[]
  preferred?: boolean
  source?: AnswerSource
}

export type AnswerPatch = Partial<AnswerDraft>

export interface CustomFieldDraft {
  label: string
  description?: string
  category?: AnswerCategory
  aliases?: readonly string[]
  controlTypes?: readonly FieldType[]
}

export type CustomFieldPatch = Partial<CustomFieldDraft>

export const invalid = (message: string, field?: string) =>
  new AutofillError('VALIDATION_FAILED', message, field ? { details: { field } } : undefined)

const SITE_PATTERN = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*$/

/** "https://www.Example.com/jobs" -> "example.com". Throws for anything that is not a hostname. */
export function normalizeSite(input: string): string {
  const site = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^(\*\.|www\.)/, '')
  if (!SITE_PATTERN.test(site)) throw invalid(`"${input}" is not a website address.`, 'sites')
  return site
}

const uniqueBy = <T>(items: readonly T[], key: (item: T) => string) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = key(item)
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

export function normalizeAliases(texts: readonly string[], label: string): AnswerAlias[] {
  const own = normalizeLabel(label)
  return uniqueBy(
    texts
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({
        text: text.slice(0, 300),
        normalized: normalizeLabel(text).slice(0, 300),
      })),
    (alias) => alias.normalized,
  ).filter((alias) => alias.normalized !== own)
}

export function normalizeTags(tags: readonly string[]): string[] {
  return uniqueBy(
    tags.map((tag) => tag.trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean),
    (tag) => tag.toLowerCase(),
  ).slice(0, 30)
}

function normalizeContext(context: Partial<AnswerContext> | undefined): AnswerContext {
  const keywords = (values: readonly string[] | undefined) =>
    uniqueBy(
      (values ?? []).map((value) => normalizeLabel(value).slice(0, 100)),
      (value) => value,
    )
  return {
    sites: uniqueBy(
      (context?.sites ?? []).filter((site) => site.trim()).map(normalizeSite),
      (site) => site,
    ),
    sectionKeywords: keywords(context?.sectionKeywords),
    formKeywords: keywords(context?.formKeywords),
    applicationTypes: uniqueBy(
      (context?.applicationTypes ?? []).map((value) => value.trim().slice(0, 100)),
      (value) => value.toLowerCase(),
    ),
  }
}

function normalizeValue(value: AnswerValue): AnswerValue {
  const parsed = answerValueSchema.safeParse(value)
  if (!parsed.success) throw invalid('This value cannot be saved.', 'value')
  const result = parsed.data
  if (result.kind === 'text' && !result.text.trim()) throw invalid('Enter a value.', 'value')
  if (result.kind === 'list') {
    const items = uniqueBy(result.items.map((item) => item.trim()).filter(Boolean), (item) =>
      item.toLowerCase(),
    )
    if (!items.length) throw invalid('Add at least one item.', 'value')
    return { kind: 'list', items }
  }
  return result
}

function fieldDefinition(data: AutofillData, semanticKey: string) {
  if (isCustomSemanticKey(semanticKey)) {
    const custom = data.customFields.find((field) => field.key === semanticKey)
    if (!custom) throw invalid('That custom field no longer exists.', 'semanticKey')
    return {
      label: custom.label,
      category: custom.category,
      aliases: custom.aliases.map((a) => a.text),
    }
  }
  const known = getSemanticKey(semanticKey)
  if (!known) throw invalid(`Unknown field "${semanticKey}".`, 'semanticKey')
  return { label: known.label, category: known.category, aliases: [] }
}

/** Validates a draft against the current data and returns the full record. */
export function buildAnswer(
  data: AutofillData,
  draft: AnswerDraft,
  base: { id: string; now: number; existing?: AnswerRecord },
): AnswerRecord {
  const label = draft.label.trim().replace(/\s+/g, ' ')
  if (!label) throw invalid('Enter a label.', 'label')
  if (label.length > 300) throw invalid('Labels can be at most 300 characters.', 'label')

  const semanticKey = draft.semanticKey ?? null
  const field = semanticKey ? fieldDefinition(data, semanticKey) : null
  const profileId = draft.profileId ?? null
  if (profileId !== null && !data.profiles.some((profile) => profile.id === profileId))
    throw invalid('That profile no longer exists.', 'profileId')

  const aliases = normalizeAliases(draft.aliases ?? [], label)
  const reason = prohibitedAnswerReason([
    label,
    ...aliases.map((alias) => alias.text),
    field?.label,
    ...(field?.aliases ?? []),
  ])
  if (reason) throw invalid(`Answers that look like a ${reason} are never saved.`, 'label')

  const existing = base.existing
  const record = {
    id: base.id,
    label,
    semanticKey,
    aliases,
    value: normalizeValue(draft.value),
    profileId,
    category: draft.category ?? field?.category ?? 'custom',
    controlTypes: uniqueBy(draft.controlTypes ?? [], (type) => type),
    context: normalizeContext(draft.context),
    tags: normalizeTags(draft.tags ?? []),
    preferred: draft.preferred ?? false,
    source: draft.source ?? existing?.source ?? 'manual',
    createdAt: existing?.createdAt ?? base.now,
    updatedAt: base.now,
    lastUsedAt: existing?.lastUsedAt ?? null,
    usageCount: existing?.usageCount ?? 0,
  }
  const parsed = answerRecordSchema.safeParse(record)
  if (!parsed.success)
    throw invalid(parsed.error.issues[0]?.message ?? 'This answer cannot be saved.')
  return parsed.data
}

/** The draft an existing answer corresponds to, for applying patches. */
export function draftOf(answer: AnswerRecord): AnswerDraft {
  return {
    label: answer.label,
    value: answer.value,
    semanticKey: answer.semanticKey,
    profileId: answer.profileId,
    category: answer.category,
    aliases: answer.aliases.map((alias) => alias.text),
    controlTypes: answer.controlTypes,
    context: answer.context,
    tags: answer.tags,
    preferred: answer.preferred,
    source: answer.source,
  }
}

export function buildProfile(
  data: AutofillData,
  draft: ProfileDraft,
  base: { id: string; now: number; existing?: Profile },
): Profile {
  const name = draft.name.trim().replace(/\s+/g, ' ')
  if (!name) throw invalid('Enter a profile name.', 'name')
  if (name.length > 100) throw invalid('Profile names can be at most 100 characters.', 'name')
  if (
    data.profiles.some(
      (profile) => profile.id !== base.id && profile.name.toLowerCase() === name.toLowerCase(),
    )
  )
    throw invalid(`A profile named "${name}" already exists.`, 'name')
  const templateId = draft.templateId ?? null
  const template = templateId ? getProfileTemplate(templateId) : undefined
  if (templateId && !template) throw invalid('Unknown profile template.', 'templateId')
  return {
    id: base.id,
    name,
    description: (draft.description ?? '').trim().slice(0, 500),
    kind: draft.kind ?? template?.kind ?? 'custom',
    isDefault: base.existing?.isDefault ?? false,
    templateId,
    createdAt: base.existing?.createdAt ?? base.now,
    updatedAt: base.now,
  }
}

/** A name like "Developer copy" or "Developer copy 2" that no profile uses yet. */
export function uniqueProfileName(data: AutofillData, wanted: string): string {
  const taken = new Set(data.profiles.map((profile) => profile.name.toLowerCase()))
  if (!taken.has(wanted.toLowerCase())) return wanted
  for (let index = 2; ; index += 1) {
    const candidate = `${wanted} ${index}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

const builtInByAlias = (() => {
  let index: Map<string, string> | null = null
  return () => {
    if (!index) {
      index = new Map()
      for (const entry of getSemanticCatalog())
        for (const alias of entry.normalizedAliases)
          if (!index.has(alias)) index.set(alias, entry.key)
    }
    return index
  }
})()

export function buildCustomField(
  data: AutofillData,
  draft: CustomFieldDraft,
  base: { key: string; now: number; existing?: CustomFieldDefinition },
): CustomFieldDefinition {
  const label = draft.label.trim().replace(/\s+/g, ' ')
  if (!label) throw invalid('Enter a field name.', 'label')
  const builtIn = builtInByAlias().get(normalizeLabel(label))
  if (builtIn)
    throw invalid(`"${label}" is already a built-in field (${semanticKeyLabel(builtIn)}).`, 'label')
  const aliases = normalizeAliases(draft.aliases ?? [], label)
  const reason = prohibitedAnswerReason([label, ...aliases.map((alias) => alias.text)])
  if (reason) throw invalid(`Fields that ask for a ${reason} cannot be saved.`, 'label')
  if (
    data.customFields.some(
      (field) => field.key !== base.key && normalizeLabel(field.label) === normalizeLabel(label),
    )
  )
    throw invalid(`A custom field named "${label}" already exists.`, 'label')
  const parsed = customFieldSchema.safeParse({
    key: base.key,
    label,
    description: (draft.description ?? '').trim().slice(0, 500),
    category: draft.category ?? 'custom',
    aliases,
    controlTypes: uniqueBy(draft.controlTypes ?? [], (type) => type),
    createdAt: base.existing?.createdAt ?? base.now,
    updatedAt: base.now,
  })
  if (!parsed.success)
    throw invalid(parsed.error.issues[0]?.message ?? 'This field cannot be saved.')
  return parsed.data
}
