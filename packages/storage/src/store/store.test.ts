import { describe, expect, it, vi } from 'vitest'

import { createMemoryStorage } from '../adapters/memory'
import { DATA_MIGRATIONS, type DataMigration } from './migrations'
import { createAutofillStore, type AutofillStoreOptions } from './store'

function setup(options: Partial<AutofillStoreOptions> = {}) {
  const adapter = options.adapter ?? createMemoryStorage()
  let clock = 1_000
  let counter = 0
  const make = () =>
    createAutofillStore({
      adapter,
      now: () => (clock += 1),
      createId: () => `id-${(counter += 1)}`,
      ...options,
    })
  return { adapter, store: make(), make }
}

const text = (value: string) => ({ kind: 'text' as const, text: value })

describe('first run', () => {
  it('creates a blank default profile, selects it and records the schema version', async () => {
    const { adapter, store } = setup()
    expect(store.getSnapshot().status).toBe('idle')
    await store.ready()

    const snapshot = store.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.profiles).toEqual([
      expect.objectContaining({
        name: 'General',
        isDefault: true,
        templateId: 'general',
        kind: 'general',
      }),
    ])
    expect(snapshot.activeProfile?.id).toBe(snapshot.profiles[0]?.id)
    expect(snapshot.answers).toEqual([])
    expect((adapter as ReturnType<typeof createMemoryStorage>).snapshot().meta).toMatchObject({
      schemaVersion: 1,
    })
  })

  it('touches no storage before ready() is called', async () => {
    const adapter = createMemoryStorage()
    const getMany = vi.spyOn(adapter, 'getMany')
    createAutofillStore({ adapter })
    expect(getMany).not.toHaveBeenCalled()
  })
})

describe('persistence', () => {
  it('keeps profiles, answers and settings for the next store on the same storage', async () => {
    const { store, make } = setup()
    const developer = await store.profiles.create({
      name: 'Developer',
      templateId: 'software-developer',
    })
    await store.answers.create({
      label: 'Email',
      semanticKey: 'email',
      value: text('a@example.test'),
    })
    await store.answers.create({
      label: 'Current title',
      semanticKey: 'currentTitle',
      value: text('Engineer'),
      profileId: developer.id,
    })
    await store.profiles.setActive(developer.id)
    store.dispose()

    const reopened = make()
    await reopened.ready()
    const snapshot = reopened.getSnapshot()
    expect(snapshot.profiles.map((profile) => profile.name)).toEqual(['General', 'Developer'])
    expect(snapshot.activeProfile?.name).toBe('Developer')
    expect(snapshot.answers.map((answer) => answer.label).sort()).toEqual([
      'Current title',
      'Email',
    ])
    expect(snapshot.answers.find((answer) => answer.label === 'Email')).toMatchObject({
      profileId: null,
      category: 'contact',
    })
  })

  it('follows changes made by another store on the same storage', async () => {
    const { store, make } = setup()
    const other = make()
    await Promise.all([store.ready(), other.ready()])
    const onChange = vi.fn()
    other.onChange(onChange)

    await store.answers.create({ label: 'City', semanticKey: 'city', value: text('Pune') })
    await vi.waitFor(() => expect(other.getSnapshot().answers).toHaveLength(1))
    expect(onChange).toHaveBeenCalledWith({
      collections: ['answers'],
      origin: 'external',
      activeProfileChanged: false,
    })
  })

  it('preserves records it cannot read instead of dropping them on the next write', async () => {
    const adapter = createMemoryStorage({
      meta: { schemaVersion: 1, createdAt: 1, updatedAt: 1 },
      profiles: [
        { id: 'p1', name: 'General', isDefault: true, createdAt: 1, updatedAt: 1 },
        { id: 'broken' },
      ],
      answers: [],
      settings: {},
    })
    const { store } = setup({ adapter })
    await store.ready()
    expect(store.getSnapshot().issues).toEqual([
      expect.objectContaining({ collection: 'profiles', count: 1 }),
    ])
    await store.profiles.create({ name: 'Second' })
    expect(adapter.snapshot().profiles).toEqual(
      expect.arrayContaining([{ id: 'broken' }, expect.objectContaining({ name: 'Second' })]),
    )
  })
})

describe('profiles', () => {
  it('switches the active profile and falls back to the default when it is removed', async () => {
    const { store } = setup()
    const changes: boolean[] = []
    store.onChange((change) => changes.push(change.activeProfileChanged))
    const tester = await store.profiles.create({ name: 'Tester', templateId: 'software-testing' })
    expect(tester.kind).toBe('role')

    await store.profiles.setActive(tester.id)
    expect(store.getSnapshot().activeProfile?.name).toBe('Tester')
    await store.profiles.remove(tester.id)
    expect(store.getSnapshot().activeProfile?.name).toBe('General')
    expect(changes).toEqual([false, true, true])
  })

  it('rejects duplicate names and removing the last profile', async () => {
    const { store } = setup()
    await store.ready()
    await expect(store.profiles.create({ name: ' general ' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
    const [only] = store.getSnapshot().profiles
    await expect(store.profiles.remove(only!.id)).rejects.toThrow('Keep at least one profile.')
  })

  it('moves the default flag and hands it on when the default profile is deleted', async () => {
    const { store } = setup()
    const second = await store.profiles.create({ name: 'Second' })
    await store.profiles.setDefault(second.id)
    expect(store.getSnapshot().profiles.map((p) => [p.name, p.isDefault])).toEqual([
      ['Second', true],
      ['General', false],
    ])
    await store.profiles.remove(second.id)
    expect(store.getSnapshot().profiles).toEqual([
      expect.objectContaining({ name: 'General', isDefault: true }),
    ])
  })

  it('duplicates a profile with its own answers and deletes them with it', async () => {
    const { store } = setup()
    const role = await store.profiles.create({ name: 'Role' })
    await store.answers.create({
      label: 'Summary',
      semanticKey: 'summary',
      value: text('Hi'),
      profileId: role.id,
    })
    await store.answers.create({
      label: 'Email',
      semanticKey: 'email',
      value: text('e@example.test'),
    })

    const copy = await store.profiles.duplicate(role.id)
    expect(copy.name).toBe('Role copy')
    const copied = store.getSnapshot().answers.filter((answer) => answer.profileId === copy.id)
    expect(copied).toEqual([expect.objectContaining({ label: 'Summary', usageCount: 0 })])

    expect(await store.profiles.remove(role.id)).toEqual({ removedAnswers: 1 })
    expect(store.getSnapshot().answers.map((answer) => answer.profileId)).toEqual([null, copy.id])
  })
})

describe('answers', () => {
  it('never saves answers that look like secrets', async () => {
    const { store } = setup()
    for (const label of ['Password', 'One-time code', 'Card number', 'API key']) {
      await expect(store.answers.create({ label, value: text('x') })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      })
    }
    await expect(
      store.answers.create({ label: 'Work email', aliases: ['Login password'], value: text('x') }),
    ).rejects.toThrow(/never saved/)
    expect(store.getSnapshot().answers).toEqual([])
  })

  it('validates labels, values, fields and profiles', async () => {
    const { store } = setup()
    await expect(store.answers.create({ label: ' ', value: text('x') })).rejects.toThrow(
      'Enter a label.',
    )
    await expect(store.answers.create({ label: 'City', value: text('  ') })).rejects.toThrow(
      'Enter a value.',
    )
    await expect(
      store.answers.create({ label: 'City', semanticKey: 'notAKey', value: text('x') }),
    ).rejects.toThrow('Unknown field')
    await expect(
      store.answers.create({ label: 'City', profileId: 'missing', value: text('x') }),
    ).rejects.toThrow('That profile no longer exists.')
  })

  it('returns the existing answer for an exact duplicate unless duplicates are allowed', async () => {
    const { store } = setup()
    const first = await store.answers.create({
      label: 'City',
      semanticKey: 'city',
      value: text('Pune'),
    })
    const again = await store.answers.create({
      label: 'Town',
      semanticKey: 'city',
      value: text(' PUNE '),
    })
    expect(again).toEqual({ answer: first.answer, created: false })
    const forced = await store.answers.create(
      { label: 'City', semanticKey: 'city', value: text('Pune') },
      { allowDuplicate: true },
    )
    expect(forced.created).toBe(true)
    expect(store.getSnapshot().answers).toHaveLength(2)
  })

  it('normalizes aliases, tags and context rules', async () => {
    const { store } = setup()
    const { answer } = await store.answers.create({
      label: 'Notice period',
      semanticKey: 'noticePeriod',
      value: text('30 days'),
      aliases: ['Notice', 'notice', 'Notice period', 'Availability'],
      tags: ['India', ' india ', 'remote'],
      context: {
        sites: ['https://www.Careers.Example.com/jobs'],
        sectionKeywords: ['Job details'],
      },
    })
    expect(answer.aliases.map((alias) => alias.text)).toEqual(['Notice', 'Availability'])
    expect(answer.tags).toEqual(['India', 'remote'])
    expect(answer.context.sites).toEqual(['careers.example.com'])
    expect(answer.context.sectionKeywords).toEqual(['job details'])
    await expect(
      store.answers.create({ label: 'X', value: text('y'), context: { sites: ['not a site'] } }),
    ).rejects.toThrow('is not a website address')
  })

  it('keeps one preferred answer among competing answers', async () => {
    const { store } = setup()
    const remote = await store.answers.create({
      label: 'Work mode',
      semanticKey: 'workMode',
      value: text('Remote'),
    })
    const hybrid = await store.answers.create({
      label: 'Work mode',
      semanticKey: 'workMode',
      value: text('Hybrid'),
      preferred: true,
    })
    await store.answers.update(remote.answer.id, { preferred: true })
    const preferred = store.getSnapshot().answers.filter((answer) => answer.preferred)
    expect(preferred.map((answer) => answer.id)).toEqual([remote.answer.id])
    expect(store.getSnapshot().answers.find((a) => a.id === hybrid.answer.id)?.preferred).toBe(
      false,
    )
  })

  it('updates, bulk edits, merges, counts usage and removes', async () => {
    const { store } = setup()
    const role = await store.profiles.create({ name: 'Role' })
    const a = await store.answers.create({
      label: 'Phone',
      semanticKey: 'phone',
      value: text('+91 1'),
      tags: ['x'],
    })
    const b = await store.answers.create(
      { label: 'Home contact', semanticKey: 'phone', value: text('+91 1'), tags: ['y'] },
      { allowDuplicate: true },
    )

    const updated = await store.answers.update(a.answer.id, { label: 'Phone number' })
    expect(updated).toMatchObject({ label: 'Phone number', createdAt: a.answer.createdAt })
    expect(updated.updatedAt).toBeGreaterThan(a.answer.updatedAt)

    await store.answers.recordUsage([a.answer.id, b.answer.id])
    const merged = await store.answers.merge(a.answer.id, [b.answer.id])
    expect(merged).toMatchObject({ usageCount: 2, tags: ['x', 'y'] })
    expect(merged.aliases.map((alias) => alias.text)).toEqual(['Home contact'])
    expect(merged.lastUsedAt).not.toBeNull()

    expect(
      await store.answers.bulkUpdate([a.answer.id], {
        profileId: role.id,
        addTags: ['z'],
        removeTags: ['X'],
      }),
    ).toBe(1)
    expect(store.getSnapshot().answers).toEqual([
      expect.objectContaining({ profileId: role.id, tags: ['y', 'z'] }),
    ])
    expect(await store.answers.remove([a.answer.id])).toBe(1)
    expect(store.getSnapshot().answers).toEqual([])
  })

  it('sets, changes and clears the answer for a field from a profile editor', async () => {
    const { store } = setup()
    await store.ready()
    const profileId = store.getSnapshot().profiles[0]!.id
    const field = { semanticKey: 'currentTitle', label: 'Current title', profileId }
    const created = await store.answers.setForField({ ...field, value: text('QA engineer') })
    const changed = await store.answers.setForField({ ...field, value: text('Lead QA') })
    expect(changed?.id).toBe(created?.id)
    expect(store.getSnapshot().answers).toEqual([
      expect.objectContaining({ value: text('Lead QA'), profileId, category: 'professional' }),
    ])
    expect(await store.answers.setForField({ ...field, value: text('') })).toBeNull()
    expect(store.getSnapshot().answers).toEqual([])
  })
})

describe('custom fields', () => {
  it('creates keyed definitions, refuses built-ins and secrets, and detaches answers on removal', async () => {
    const { store } = setup()
    const office = await store.customFields.create({
      label: 'Preferred office',
      aliases: ['Office location'],
    })
    expect(office.key).toBe('custom:preferred-office')
    const second = await store.customFields
      .create({ label: 'Preferred office!' })
      .catch((error: Error) => error)
    expect(second).toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(store.customFields.create({ label: 'Email address' })).rejects.toThrow(
      'built-in field',
    )
    await expect(store.customFields.create({ label: 'Bank account' })).rejects.toThrow(
      'cannot be saved',
    )

    await store.answers.create({
      label: 'Preferred office',
      semanticKey: office.key,
      value: text('Pune'),
    })
    expect(store.getSnapshot().answers[0]?.category).toBe('custom')
    const renamed = await store.customFields.update(office.key, { label: 'Office preference' })
    expect(renamed.key).toBe(office.key)
    expect(await store.customFields.remove(office.key)).toEqual({ detachedAnswers: 1 })
    expect(store.getSnapshot().answers[0]).toMatchObject({
      semanticKey: null,
      label: 'Preferred office',
    })
  })
})

describe('settings', () => {
  it('merges partial updates section by section and validates them', async () => {
    const { store } = setup()
    const settings = await store.settings.update({ mode: 'suggest', synthetic: { seed: 'qa' } })
    expect(settings).toMatchObject({ mode: 'suggest', synthetic: { enabled: false, seed: 'qa' } })
    await expect(store.settings.update({ thresholds: { high: 0.5 } })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
    expect(store.getSnapshot().settings.thresholds).toEqual({ high: 0.9, medium: 0.7 })
  })
})

describe('schema versions', () => {
  it('refuses data written by a newer version and leaves it untouched', async () => {
    const stored = { meta: { schemaVersion: 99, createdAt: 1, updatedAt: 1 }, profiles: ['future'] }
    const adapter = createMemoryStorage(stored)
    const { store } = setup({ adapter })
    await store.ready()
    expect(store.getSnapshot()).toMatchObject({
      status: 'error',
      error: { reason: 'newer-schema' },
    })
    await expect(store.profiles.create({ name: 'X' })).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
    })
    expect(adapter.snapshot()).toEqual(stored)
  })

  it('runs later migrations in order and writes the result once', async () => {
    const adapter = createMemoryStorage()
    const v1 = setup({ adapter })
    await v1.store.answers.create({ label: 'City', value: text('Pune') })
    const setMany = vi.spyOn(adapter, 'setMany')

    const v2: DataMigration = {
      version: 2,
      description: 'Tag every answer',
      migrate: (data) => ({
        ...data,
        answers: (data.answers as Array<Record<string, unknown>>).map((answer) => ({
          ...answer,
          tags: ['migrated'],
        })),
      }),
    }
    const { store } = setup({ adapter, migrations: [...DATA_MIGRATIONS, v2] })
    await store.ready()
    expect(store.getSnapshot().answers[0]?.tags).toEqual(['migrated'])
    expect(adapter.snapshot().meta).toMatchObject({ schemaVersion: 2 })
    expect(setMany).toHaveBeenCalledOnce()
  })

  it('leaves the data as it was when a migration fails', async () => {
    const adapter = createMemoryStorage()
    await setup({ adapter }).store.ready()
    const before = adapter.snapshot()
    const failing: DataMigration = {
      version: 2,
      description: 'Broken',
      migrate: () => {
        throw new Error('bad step')
      },
    }
    const { store } = setup({ adapter, migrations: [...DATA_MIGRATIONS, failing] })
    await store.ready()
    expect(store.getSnapshot().status).toBe('error')
    expect(adapter.snapshot()).toEqual(before)
  })
})

describe('deleting everything', () => {
  it('removes all data and starts again with a blank default profile', async () => {
    const { adapter, store } = setup()
    await store.profiles.create({ name: 'Role' })
    await store.answers.create({ label: 'City', value: text('Pune') })
    await store.deleteAll()
    const snapshot = store.getSnapshot()
    expect(snapshot.profiles).toEqual([
      expect.objectContaining({ name: 'General', isDefault: true }),
    ])
    expect(snapshot.answers).toEqual([])
    expect(
      Object.keys((adapter as ReturnType<typeof createMemoryStorage>).snapshot()).sort(),
    ).toEqual(['answers', 'customFields', 'mappings', 'meta', 'profiles', 'settings'])
  })
})
