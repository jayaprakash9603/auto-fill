import {
  PLUGIN_API_VERSION,
  PluginRegistry,
  SYNTHETIC_CATEGORIES,
  type AutofillEvent,
  type FieldDescriptor,
  type PageDriver,
} from '@ufa/core'
import { createAutofillStore, createMemoryStorage } from '@ufa/storage'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDomPageDriver } from '../dom/dom-page-driver'
import { createAutofill } from './create-autofill'

function idleDriver(): PageDriver {
  return {
    connect: vi.fn(async () => {
      throw new Error('not used')
    }),
    scan: vi.fn(),
    subscribe: () => () => undefined,
    dispose: async () => undefined,
  } as unknown as PageDriver
}

describe('controller data', () => {
  it('exposes the store without a page and reports data and profile changes as events', async () => {
    const controller = createAutofill({ driver: idleDriver(), storage: createMemoryStorage() })
    const events: AutofillEvent[] = []
    controller.on('data:changed', (event) => events.push(event))
    controller.on('profile:changed', (event) => events.push(event))

    await controller.store.ready()
    expect(events).toEqual([])
    const profile = await controller.store.profiles.create({ name: 'Tester' })
    await controller.store.profiles.setActive(profile.id)

    expect(events).toEqual([
      { type: 'data:changed', collection: 'profiles' },
      { type: 'data:changed', collection: 'settings' },
      { type: 'profile:changed', profileId: profile.id },
    ])
    expect(controller.getState().status).toBe('idle')
  })

  it('disposes its own store on destroy but leaves a shared one alone', async () => {
    const storage = createMemoryStorage()
    const shared = createAutofillStore({ adapter: storage })
    const borrowing = createAutofill({ driver: idleDriver(), storage, store: shared })
    const owning = createAutofill({ driver: idleDriver(), storage })
    expect(borrowing.store).toBe(shared)

    await Promise.all([borrowing.destroy(), owning.destroy()])
    await expect(shared.profiles.create({ name: 'Still works' })).resolves.toMatchObject({
      name: 'Still works',
    })
    await expect(owning.store.profiles.create({ name: 'Gone' })).rejects.toMatchObject({
      code: 'DESTROYED',
    })
  })
})

describe('controller matching', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function renderForm() {
    document.body.innerHTML = `
      <form>
        <label for="contact">Contact</label>
        <input id="contact" type="email" autocomplete="email">
        <label for="notice">Notice period</label>
        <input id="notice" type="text">
        <label for="colour">Favourite colour</label>
        <input id="colour" type="text">
        <label for="pw">Password</label>
        <input id="pw" type="password">
      </form>`
  }

  async function connected(registry?: PluginRegistry) {
    renderForm()
    const controller = createAutofill({
      driver: createDomPageDriver({ observe: false }),
      storage: createMemoryStorage(),
      ...(registry ? { registry } : {}),
    })
    await controller.store.ready()
    await controller.store.answers.create({
      label: 'Email',
      semanticKey: 'email',
      value: { kind: 'text', text: 'person@example.com' },
    })
    await controller.store.answers.create({
      label: 'Notice period',
      value: { kind: 'text', text: '30 days' },
    })
    await controller.connect()
    const byLabel = (label: string) => {
      const field = controller.getState().fields.find((candidate) => candidate.label === label)
      if (!field) throw new Error(`No field labelled ${label}`)
      return { field, match: controller.getState().matches[field.id] }
    }
    return { controller, byLabel }
  }

  it('classifies detected fields and matches them against saved answers', async () => {
    const { controller, byLabel } = await connected()

    const contact = byLabel('Contact')
    expect(contact.field).toMatchObject<Partial<FieldDescriptor>>({
      semanticKey: 'email',
      semanticReason: 'autocomplete="email"',
    })
    expect(contact.match).toMatchObject({
      state: 'matched',
      best: {
        strategyId: 'ufa.semantic-key',
        fillValue: { kind: 'text', text: 'person@example.com' },
        confidence: { level: 'high' },
      },
    })
    expect(byLabel('Notice period').match).toMatchObject({
      state: 'matched',
      best: { strategyId: 'ufa.exact-label' },
    })
    expect(byLabel('Favourite colour').match?.state).toBe('missing')
    expect(byLabel('Password').match).toMatchObject({ state: 'skipped', best: null })
    await controller.destroy()
  })

  it('rematches when saved answers change and reports the counts', async () => {
    const { controller, byLabel } = await connected()
    const counts: Record<string, number>[] = []
    controller.on('match:complete', (event) => counts.push(event.counts))

    await controller.store.answers.create({
      label: 'Favourite colour',
      value: { kind: 'text', text: 'Green' },
    })
    expect(byLabel('Favourite colour').match).toMatchObject({
      state: 'matched',
      best: { fillValue: { kind: 'text', text: 'Green' } },
    })
    expect(counts.at(-1)).toEqual({ matched: 3, skipped: 1 })
    await controller.destroy()
  })

  it('reclassifies fields when the user adds a custom field', async () => {
    const { controller, byLabel } = await connected()
    const custom = await controller.store.customFields.create({ label: 'Favourite colour' })
    expect(byLabel('Favourite colour').field).toMatchObject({
      semanticKey: custom.key,
      semanticReason: 'label "Favourite colour" (your field "Favourite colour")',
    })
    await controller.destroy()
  })

  it('runs matching strategies registered by the host', async () => {
    const registry = new PluginRegistry().registerMatcher({
      id: 'test.colour',
      apiVersion: PLUGIN_API_VERSION,
      order: 15,
      match: (field, answers) =>
        field.label === 'Favourite colour' && answers[0]
          ? [{ answerId: answers[0].id, score: 0.8, explanation: 'Chosen by a host plugin' }]
          : [],
    })
    const { controller, byLabel } = await connected(registry)
    expect(byLabel('Favourite colour').match).toMatchObject({
      state: 'suggested',
      best: { strategyId: 'test.colour', explanation: 'Chosen by a host plugin' },
    })
    await controller.destroy()
  })

  it('generates in-memory previews when synthetic data is enabled', async () => {
    const { controller, byLabel } = await connected()
    await controller.store.settings.update({
      synthetic: { enabled: true, allowedCategories: [...SYNTHETIC_CATEGORIES] },
    })
    const colour = byLabel('Favourite colour').field
    const results = await controller.generate({ fieldIds: [colour.id] })
    expect(results.length).toBe(1)
    expect(results[0]).toMatchObject({
      fieldId: colour.id,
      source: 'generated',
      valid: true,
    })
    expect(controller.getState().generated[colour.id]?.value).toEqual(results[0]?.value)
    await controller.destroy()
  })

  it('clears selected fields through the driver', async () => {
    renderForm()
    const driver = createDomPageDriver({ observe: false })
    const clear = vi.fn(driver.clear)
    driver.clear = clear
    const controller = createAutofill({ driver, storage: createMemoryStorage() })
    await controller.connect()
    const contact = controller.getState().fields.find((field) => field.label === 'Contact')
    expect(contact).toBeTruthy()
    const input = document.querySelector<HTMLInputElement>('#contact')
    input!.value = 'typed@example.com'
    await controller.scan()
    const field = controller.getState().fields.find((entry) => entry.id === contact!.id)
    expect(field?.hasValue).toBe(true)
    clear.mockImplementation(async () => [
      {
        fieldId: contact!.id,
        status: 'cleared',
        reason: null,
        verified: true,
        snapshotId: 'snap-clear',
      },
    ])
    const results = await controller.clear({ fieldIds: [contact!.id] })
    expect(clear).toHaveBeenCalled()
    expect(results[0]).toMatchObject({ status: 'cleared' })
    expect(controller.getState().canUndo).toBe(true)
    await controller.destroy()
  })

  it('rejects work after destroy and serializes fill operations', async () => {
    const driver = createDomPageDriver({ observe: false })
    const controller = createAutofill({ driver, storage: createMemoryStorage() })
    await controller.connect()
    await controller.destroy()
    await expect(controller.connect()).rejects.toMatchObject({ code: 'DESTROYED' })
    await expect(controller.fill()).rejects.toMatchObject({ code: 'DESTROYED' })
    await controller.destroy()
  })

  it('clears matches when the page goes away', async () => {
    const { controller } = await connected()
    expect(Object.keys(controller.getState().matches)).toHaveLength(4)
    await controller.destroy()
    const driver = createDomPageDriver({ observe: false })
    const fresh = createAutofill({ driver, storage: createMemoryStorage() })
    await fresh.connect()
    driver.emit({ type: 'disconnected', reason: 'test' })
    expect(fresh.getState()).toMatchObject({ fields: [], matches: {} })
    await fresh.destroy()
  })
})
