import { EXPORT_FORMAT, type AnswerRecord } from '@ufa/core'
import { describe, expect, it } from 'vitest'

import { createMemoryStorage } from '../adapters/memory'
import { findDuplicateAnswers, queryAnswers } from './queries'
import { createAutofillStore } from './store'
import { serializeExport } from './transfer'

const text = (value: string) => ({ kind: 'text' as const, text: value })

function store(prefix: string) {
  let clock = 1_000
  let counter = 0
  return createAutofillStore({
    adapter: createMemoryStorage(),
    now: () => (clock += 1),
    createId: () => `${prefix}-${(counter += 1)}`,
  })
}

async function seeded() {
  const source = store('src')
  const role = await source.profiles.create({ name: 'Developer', templateId: 'software-developer' })
  const office = await source.customFields.create({ label: 'Preferred office' })
  await source.answers.create({
    label: 'Email',
    semanticKey: 'email',
    value: text('dev@example.test'),
  })
  await source.answers.create({
    label: 'Skills',
    semanticKey: 'skills',
    value: { kind: 'list', items: ['TypeScript', 'Playwright'] },
    profileId: role.id,
  })
  await source.answers.create({ label: 'Office', semanticKey: office.key, value: text('Pune') })
  await source.settings.update({ mode: 'suggest', activeProfileId: role.id })
  return { source, role }
}

describe('export and import', () => {
  it('round-trips everything through JSON into an empty store', async () => {
    const { source } = await seeded()
    const json = serializeExport(await source.transfer.export())
    const parsed = source.transfer.parse(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const target = store('dst')
    const report = await target.transfer.import(parsed.bundle, { includeSettings: true })
    // The target's own blank "General" profile absorbs the imported one with the same name.
    expect(report).toMatchObject({
      profiles: { added: 1, updated: 0, unchanged: 1 },
      answers: { added: 3, skipped: 0 },
      customFields: { added: 1 },
      settingsApplied: true,
    })
    const snapshot = target.getSnapshot()
    expect(snapshot.profiles.map((profile) => profile.name)).toEqual(['General', 'Developer'])
    expect(snapshot.settings.mode).toBe('suggest')
    expect(snapshot.activeProfile?.name).toBe('Developer')
    expect(snapshot.answers.find((answer) => answer.label === 'Skills')?.profileId).toBe(
      snapshot.activeProfile?.id,
    )
  })

  it('merges a second import without duplicating anything', async () => {
    const { source } = await seeded()
    const bundle = await source.transfer.export()
    const target = store('dst')
    await target.transfer.import(bundle)
    const again = await target.transfer.import(bundle)
    expect(again.answers).toMatchObject({ added: 0, unchanged: 3 })
    expect(again.profiles).toMatchObject({ added: 0 })
    expect(target.getSnapshot().answers).toHaveLength(3)
    expect(target.getSnapshot().settings.mode).toBe('review')
  })

  it('previews without writing, and replace discards existing data', async () => {
    const { source } = await seeded()
    const bundle = await source.transfer.export({ includeSettings: false })
    expect(bundle.settings).toBeUndefined()
    const target = store('dst')
    await target.answers.create({ label: 'Old answer', value: text('gone') })

    const preview = await target.transfer.preview(bundle, { strategy: 'replace' })
    expect(preview.answers.added).toBe(3)
    expect(target.getSnapshot().answers.map((answer) => answer.label)).toEqual(['Old answer'])

    await target.transfer.import(bundle, { strategy: 'replace' })
    const labels = target
      .getSnapshot()
      .answers.map((answer) => answer.label)
      .sort()
    expect(labels).toEqual(['Email', 'Office', 'Skills'])
    expect(target.getSnapshot().profiles.filter((profile) => profile.isDefault)).toHaveLength(1)
  })

  it('exports one profile with the global answers only', async () => {
    const { source, role } = await seeded()
    const general = source.getSnapshot().profiles.find((profile) => profile.isDefault)!
    const bundle = await source.transfer.export({ profileIds: [general.id] })
    expect(bundle.profiles.map((profile) => profile.name)).toEqual(['General'])
    expect(bundle.answers.every((answer) => answer.profileId !== role.id)).toBe(true)
  })

  it('skips answers that look like secrets and warns about risky settings', async () => {
    const { source } = await seeded()
    const bundle = await source.transfer.export()
    const secret: AnswerRecord = {
      ...bundle.answers[0]!,
      id: 'secret',
      label: 'Account password',
      semanticKey: null,
    }
    const target = store('dst')
    const report = await target.transfer.import(
      {
        ...bundle,
        answers: [...bundle.answers, secret],
        settings: {
          ...bundle.settings!,
          synthetic: { ...bundle.settings!.synthetic, enabled: true },
        },
      },
      { includeSettings: true },
    )
    expect(report.answers.skipped).toBe(1)
    expect(report.warnings).toEqual([
      expect.stringContaining('passwords, codes or payment details'),
      'The imported settings turn on synthetic test data.',
    ])
    expect(target.getSnapshot().answers.some((answer) => answer.label === 'Account password')).toBe(
      false,
    )
  })

  it('skips custom fields named like secrets and the answers saved for them', async () => {
    const { source } = await seeded()
    const bundle = await source.transfer.export()
    const target = store('dst')
    const report = await target.transfer.import({
      ...bundle,
      customFields: [
        {
          key: 'custom:backup-card',
          label: 'Backup card number',
          description: '',
          category: 'custom',
          aliases: [],
          controlTypes: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      answers: [
        ...bundle.answers,
        { ...bundle.answers[0]!, id: 'linked', label: 'Backup', semanticKey: 'custom:backup-card' },
      ],
    })
    expect(report.customFields).toMatchObject({ added: 0, skipped: 1 })
    expect(report.answers.skipped).toBe(1)
    expect(report.warnings).toEqual([
      expect.stringContaining('1 field named like passwords'),
      expect.stringContaining('1 answer that looked like passwords'),
    ])
    const snapshot = target.getSnapshot()
    expect(snapshot.customFields).toEqual([])
    expect(snapshot.answers.some((answer) => answer.label === 'Backup')).toBe(false)
  })

  it('explains files it cannot import', () => {
    const { transfer } = store('x')
    expect(transfer.parse('{not json')).toEqual({
      ok: false,
      errors: ['The file is not valid JSON.'],
    })
    expect(transfer.parse({ format: 'other' })).toEqual({
      ok: false,
      errors: ['This is not a Universal Form Autofill export file.'],
    })
    expect(transfer.parse({ format: EXPORT_FORMAT, version: 2 })).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('newer version')],
    })
    const broken = transfer.parse({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: 1,
      profiles: [{ id: 'p', name: '' }],
      answers: [],
    })
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.errors[0]).toMatch(/^profiles\.0\./)
  })
})

describe('queries', () => {
  it('searches labels, aliases, tags and values within a scope, and finds duplicates', async () => {
    const { source, role } = await seeded()
    await source.answers.create(
      {
        label: 'Contact email',
        semanticKey: 'email',
        value: text('DEV@example.test'),
        tags: ['work'],
      },
      { allowDuplicate: true },
    )
    await source.answers.create({
      label: 'Email',
      semanticKey: 'email',
      value: text('me@example.test'),
    })
    const answers = source.getSnapshot().answers

    expect(queryAnswers(answers, { text: 'typescript' }).map((a) => a.label)).toEqual(['Skills'])
    expect(queryAnswers(answers, { text: 'email', scope: 'global' })).toHaveLength(3)
    expect(queryAnswers(answers, { scope: { profileId: role.id } }).map((a) => a.label)).toEqual([
      'Skills',
    ])
    expect(queryAnswers(answers, { tag: 'WORK' }).map((a) => a.label)).toEqual(['Contact email'])
    expect(
      queryAnswers(answers, { text: 'office' }, source.getSnapshot().customFields).map(
        (a) => a.label,
      ),
    ).toEqual(['Office'])

    const report = findDuplicateAnswers(answers)
    expect(report.duplicates.map((group) => group.map((a) => a.label).sort())).toEqual([
      ['Contact email', 'Email'],
    ])
    expect(report.conflicts).toHaveLength(1)
    expect(report.conflicts[0]).toHaveLength(3)
  })
})
