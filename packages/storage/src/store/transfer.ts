import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  MAX_IMPORT_LENGTH,
  exportBundleSchema,
  getSemanticKey,
  prohibitedAnswerReason,
  type AnswerRecord,
  type ExportBundle,
  type IdGenerator,
  type Profile,
} from '@ufa/core'

import type { AutofillData } from './keys'
import { normalizeData } from './load'
import { enforcePreferred, findDuplicateOf } from './queries'

export interface ExportOptions {
  /** Profiles to include, with their own answers. Defaults to all. Global answers are always included. */
  profileIds?: readonly string[] | null
  /** Defaults to true. */
  includeSettings?: boolean
}

export function buildExport(data: AutofillData, options: ExportOptions, now: number): ExportBundle {
  const wanted = options.profileIds ? new Set(options.profileIds) : null
  const profiles = wanted
    ? data.profiles.filter((profile) => wanted.has(profile.id))
    : data.profiles
  const included = new Set(profiles.map((profile) => profile.id))
  const answers = data.answers.filter(
    (answer) => answer.profileId === null || included.has(answer.profileId),
  )
  const answerIds = new Set(answers.map((answer) => answer.id))
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now,
    profiles,
    answers,
    customFields: data.customFields,
    mappings: data.mappings.filter((mapping) => answerIds.has(mapping.answerId)),
    ...(options.includeSettings === false ? {} : { settings: data.settings }),
  }
}

export function serializeExport(bundle: ExportBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`
}

export type ParsedImport = { ok: true; bundle: ExportBundle } | { ok: false; errors: string[] }

/** Validates an export file. Nothing in it is ever executed; unknown properties are dropped. */
export function parseImport(input: string | unknown): ParsedImport {
  let raw = input
  if (typeof input === 'string') {
    if (input.length > MAX_IMPORT_LENGTH)
      return { ok: false, errors: ['The file is too large to import.'] }
    try {
      raw = JSON.parse(input)
    } catch {
      return { ok: false, errors: ['The file is not valid JSON.'] }
    }
  }
  const format = (raw as { format?: unknown } | null)?.format
  if (format !== EXPORT_FORMAT)
    return { ok: false, errors: ['This is not a Universal Form Autofill export file.'] }
  const version = (raw as { version?: unknown }).version
  if (typeof version === 'number' && version > EXPORT_VERSION)
    return {
      ok: false,
      errors: ['This file was exported by a newer version. Update the extension to import it.'],
    }
  const parsed = exportBundleSchema.safeParse(raw)
  if (parsed.success) return { ok: true, bundle: parsed.data }
  const errors = parsed.error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
  if (parsed.error.issues.length > 5)
    errors.push(`…and ${parsed.error.issues.length - 5} more problems.`)
  return { ok: false, errors }
}

export type ImportStrategy = 'merge' | 'replace'

export interface ImportOptions {
  /** `merge` (default) keeps existing data and adds or updates; `replace` discards it first. */
  strategy?: ImportStrategy
  /** Settings are imported only when asked, because they can change how filling behaves. */
  includeSettings?: boolean
}

interface Counts {
  added: number
  updated: number
  unchanged: number
}

export interface ImportReport {
  strategy: ImportStrategy
  profiles: Counts
  answers: Counts & { skipped: number }
  customFields: Counts & { skipped: number }
  mappings: { added: number; skipped: number }
  settingsApplied: boolean
  warnings: string[]
}

const counts = (): Counts => ({ added: 0, updated: 0, unchanged: 0 })

const isNewer = (incoming: { updatedAt: number }, existing: { updatedAt: number }) =>
  incoming.updatedAt > existing.updatedAt

/**
 * Computes the data after an import, without writing it. Profiles are matched by id, then by name;
 * answers by id, then as duplicates. Newer records win. Answers that look like secrets are dropped.
 */
export function planImport(
  current: AutofillData,
  bundle: ExportBundle,
  options: ImportOptions,
  context: { now: number; createId: IdGenerator },
): { data: AutofillData; report: ImportReport } {
  const strategy = options.strategy ?? 'merge'
  const base: AutofillData =
    strategy === 'replace'
      ? { profiles: [], answers: [], customFields: [], mappings: [], settings: current.settings }
      : current
  const report: ImportReport = {
    strategy,
    profiles: counts(),
    answers: { ...counts(), skipped: 0 },
    customFields: { ...counts(), skipped: 0 },
    mappings: { added: 0, skipped: 0 },
    settingsApplied: false,
    warnings: [],
  }

  // Profiles
  const profiles = [...base.profiles]
  const profileIds = new Map<string, string>()
  for (const incoming of bundle.profiles) {
    const sameName = (profile: Profile) =>
      profile.name.toLowerCase() === incoming.name.toLowerCase()
    let index = profiles.findIndex((profile) => profile.id === incoming.id)
    if (index < 0) index = profiles.findIndex(sameName)
    const existing = profiles[index]
    if (existing) {
      profileIds.set(incoming.id, existing.id)
      if (isNewer(incoming, existing)) {
        profiles[index] = {
          ...existing,
          name: profiles.some((profile) => profile.id !== existing.id && sameName(profile))
            ? existing.name
            : incoming.name,
          description: incoming.description,
          kind: incoming.kind,
          templateId: incoming.templateId,
          updatedAt: incoming.updatedAt,
        }
        report.profiles.updated += 1
      } else report.profiles.unchanged += 1
    } else {
      const added: Profile = {
        ...incoming,
        isDefault: strategy === 'replace' && incoming.isDefault,
      }
      profiles.push(added)
      profileIds.set(incoming.id, added.id)
      report.profiles.added += 1
    }
  }
  if (profiles.length === 0) {
    profiles.push({
      id: context.createId(),
      name: 'General',
      description: '',
      kind: 'general',
      isDefault: true,
      templateId: 'general',
      createdAt: context.now,
      updatedAt: context.now,
    })
  }

  // Custom fields
  const customFields = [...base.customFields]
  for (const incoming of bundle.customFields) {
    if (prohibitedAnswerReason([incoming.label, ...incoming.aliases.map((alias) => alias.text)])) {
      report.customFields.skipped += 1
      continue
    }
    const index = customFields.findIndex((field) => field.key === incoming.key)
    const existing = customFields[index]
    if (!existing) {
      customFields.push(incoming)
      report.customFields.added += 1
    } else if (isNewer(incoming, existing)) {
      customFields[index] = incoming
      report.customFields.updated += 1
    } else report.customFields.unchanged += 1
  }
  if (report.customFields.skipped)
    report.warnings.push(
      `${report.customFields.skipped} field${report.customFields.skipped === 1 ? '' : 's'} named like passwords, codes or payment details ${report.customFields.skipped === 1 ? 'was' : 'were'} skipped.`,
    )
  const customByKey = new Map(customFields.map((field) => [field.key, field]))
  const incomingCustom = new Map(bundle.customFields.map((field) => [field.key, field]))
  const linkedLabels = (semanticKey: string | null) => {
    if (!semanticKey) return []
    const definitions = [customByKey.get(semanticKey), incomingCustom.get(semanticKey)]
    return [
      getSemanticKey(semanticKey)?.label,
      ...definitions.flatMap((field) =>
        field ? [field.label, ...field.aliases.map((alias) => alias.text)] : [],
      ),
    ]
  }

  // Answers
  let answers = [...base.answers]
  const answerIds = new Map<string, string>()
  let prohibited = 0
  let orphaned = 0
  for (const raw of bundle.answers) {
    const labels = [
      raw.label,
      ...raw.aliases.map((alias) => alias.text),
      ...linkedLabels(raw.semanticKey),
    ]
    if (prohibitedAnswerReason(labels)) {
      prohibited += 1
      continue
    }
    const profileId = raw.profileId === null ? null : (profileIds.get(raw.profileId) ?? undefined)
    if (profileId === undefined) {
      orphaned += 1
      continue
    }
    const incoming: AnswerRecord = {
      ...raw,
      profileId,
      semanticKey:
        raw.semanticKey &&
        raw.semanticKey.startsWith('custom:') &&
        !customByKey.has(raw.semanticKey)
          ? null
          : raw.semanticKey,
    }
    const index = answers.findIndex((answer) => answer.id === incoming.id)
    const existing = answers[index]
    if (existing) {
      answerIds.set(raw.id, existing.id)
      if (isNewer(incoming, existing)) {
        answers[index] = incoming
        report.answers.updated += 1
      } else report.answers.unchanged += 1
      continue
    }
    const duplicate = findDuplicateOf(answers, incoming)
    if (duplicate) {
      answerIds.set(raw.id, duplicate.id)
      report.answers.unchanged += 1
      continue
    }
    answers.push(incoming)
    answerIds.set(raw.id, incoming.id)
    report.answers.added += 1
  }
  answers = enforcePreferred(answers)
  report.answers.skipped = prohibited + orphaned
  if (prohibited)
    report.warnings.push(
      `${prohibited} answer${prohibited === 1 ? '' : 's'} that looked like passwords, codes or payment details ${prohibited === 1 ? 'was' : 'were'} skipped.`,
    )
  if (orphaned)
    report.warnings.push(
      `${orphaned} answer${orphaned === 1 ? '' : 's'} belonged to a profile missing from the file and ${orphaned === 1 ? 'was' : 'were'} skipped.`,
    )

  // Mappings
  const mappings = [...base.mappings]
  const keptAnswerIds = new Set(answers.map((answer) => answer.id))
  for (const raw of bundle.mappings) {
    const answerId = answerIds.get(raw.answerId)
    const profileId = raw.profileId === null ? null : (profileIds.get(raw.profileId) ?? undefined)
    const clash = mappings.some(
      (mapping) =>
        mapping.site === raw.site &&
        mapping.fieldSignature === raw.fieldSignature &&
        mapping.profileId === profileId,
    )
    if (!answerId || !keptAnswerIds.has(answerId) || profileId === undefined || clash) {
      report.mappings.skipped += 1
      continue
    }
    mappings.push({ ...raw, answerId, profileId })
    report.mappings.added += 1
  }

  // Settings
  let settings = base.settings
  if (options.includeSettings && bundle.settings) {
    const activeProfileId =
      bundle.settings.activeProfileId === null
        ? null
        : (profileIds.get(bundle.settings.activeProfileId) ?? null)
    settings = { ...bundle.settings, activeProfileId }
    report.settingsApplied = true
    if (settings.synthetic.enabled && !current.settings.synthetic.enabled)
      report.warnings.push('The imported settings turn on synthetic test data.')
    if (settings.trusted.sites.length > current.settings.trusted.sites.length)
      report.warnings.push(
        `The imported settings allow trusted mode on ${settings.trusted.sites.length} site${settings.trusted.sites.length === 1 ? '' : 's'}.`,
      )
    if (settings.overwriteExisting && !current.settings.overwriteExisting)
      report.warnings.push(
        'The imported settings allow overwriting fields that already have a value.',
      )
  } else if (strategy === 'replace') {
    settings = { ...settings, activeProfileId: null }
  }

  return {
    data: normalizeData({ profiles, answers, customFields, mappings, settings }),
    report,
  }
}
