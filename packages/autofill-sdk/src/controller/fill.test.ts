import {
  PLUGIN_API_VERSION,
  PluginRegistry,
  type AutofillEvent,
  type AutofillSettingsInput,
  type FillResult,
  type PageDriver,
} from '@ufa/core'
import { createMemoryStorage, type AnswerDraft } from '@ufa/storage'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDomPageDriver } from '../dom/dom-page-driver'
import { createAutofill } from './create-autofill'
import type { AutofillController } from './types'

const FORM = `
  <form>
    <label for="first">First name</label>
    <input id="first" autocomplete="given-name">
    <label for="last">Last name</label>
    <input id="last" autocomplete="family-name" value="Existing">
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email">
    <label for="phone">Phone</label>
    <input id="phone" type="tel">
    <label for="notice">Notice period</label>
    <input id="notice">
    <label for="country">Country</label>
    <select id="country"><option value="">Select…</option><option value="IN">India</option></select>
    <fieldset>
      <legend>Will you require sponsorship?</legend>
      <label><input type="radio" name="sponsor" value="yes"> Yes</label>
      <label><input type="radio" name="sponsor" value="no"> No</label>
    </fieldset>
    <label><input type="checkbox" id="terms"> I agree to the terms and conditions</label>
    <label for="pw">Password</label>
    <input id="pw" type="password">
  </form>`

const ANSWERS: AnswerDraft[] = [
  { label: 'First name', value: { kind: 'text', text: 'Ada' } },
  { label: 'Last name', value: { kind: 'text', text: 'Lovelace' } },
  { label: 'Email', semanticKey: 'email', value: { kind: 'text', text: 'ada@example.com' } },
  { label: 'Country', value: { kind: 'text', text: 'India' } },
  { label: 'Will you require sponsorship?', value: { kind: 'boolean', value: false } },
  { label: 'I agree to the terms and conditions', value: { kind: 'boolean', value: true } },
]

/** What the page shows, by element id (radios by group name). */
function pageValues() {
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value
  return {
    first: value('first'),
    last: value('last'),
    email: value('email'),
    phone: value('phone'),
    notice: value('notice'),
    country: value('country'),
    sponsor:
      document.querySelector<HTMLInputElement>('input[name="sponsor"]:checked')?.value ?? null,
    terms: (document.getElementById('terms') as HTMLInputElement).checked,
    pw: value('pw'),
  }
}

const UNTOUCHED = {
  first: '',
  last: 'Existing',
  email: '',
  phone: '',
  notice: '',
  country: '',
  sponsor: null,
  terms: false,
  pw: '',
}

let controller: AutofillController | null = null

afterEach(async () => {
  await controller?.destroy()
  controller = null
  document.body.innerHTML = ''
})

async function setup(
  options: {
    settings?: AutofillSettingsInput
    answers?: AnswerDraft[]
    registry?: PluginRegistry
    driver?: PageDriver
  } = {},
) {
  document.body.innerHTML = FORM
  controller = createAutofill({
    driver: options.driver ?? createDomPageDriver({ observe: false, optionTimeoutMs: 200 }),
    storage: createMemoryStorage(),
    ...(options.registry ? { registry: options.registry } : {}),
  })
  const store = controller.store
  await store.ready()
  for (const answer of options.answers ?? ANSWERS) await store.answers.create(answer)
  if (options.settings) await store.settings.update(options.settings)
  await controller.connect()
  const ready = controller
  const idOf = (label: string) => {
    const field = ready
      .getState()
      .fields.find((candidate) => candidate.label.startsWith(label))
    if (!field) throw new Error(`No field labelled ${label}`)
    return field.id
  }
  const allIds = () => ready.getState().fields.map((field) => field.id)
  const byField = (results: FillResult[]) =>
    Object.fromEntries(
      results.map((result) => [
        ready.getState().fields.find((field) => field.id === result.fieldId)?.label ?? result.fieldId,
        [result.status, result.reason],
      ]),
    )
  return { controller: ready, idOf, allIds, byField }
}

describe('controller fill', () => {
  it('fills nothing in review mode until the user selects fields', async () => {
    const { controller } = await setup()
    expect(controller.getState().decisions).not.toEqual({})
    expect(await controller.fill()).toEqual([])
    expect(pageValues()).toEqual(UNTOUCHED)
  })

  it('fills only selected, eligible fields and keeps values that were already there', async () => {
    const { controller, allIds, byField } = await setup()
    const events: AutofillEvent[] = []
    controller.on('fill:complete', (event) => events.push(event))

    const results = await controller.fill({ fieldIds: allIds() })

    expect(byField(results)).toEqual({
      'First name': ['filled', null],
      'Last name': ['skipped', 'Already has a value; it is kept.'],
      Email: ['filled', null],
      Phone: ['skipped', 'No saved answer fits "Phone".'],
      'Notice period': ['skipped', 'No saved answer fits "Notice period".'],
      Country: ['filled', null],
      'Will you require sponsorship?': ['filled', null],
      'I agree to the terms and conditions': ['filled', null],
      Password: ['skipped', expect.stringContaining('never filled')],
    })
    expect(pageValues()).toEqual({
      ...UNTOUCHED,
      first: 'Ada',
      email: 'ada@example.com',
      country: 'IN',
      sponsor: 'no',
      terms: true,
    })
    expect(events).toEqual([{ type: 'fill:complete', results }])
    expect(controller.getState()).toMatchObject({ filling: false, canUndo: true })
    expect(Object.keys(controller.getState().results)).toHaveLength(results.length)
  })

  it('rescans after filling and records which answers were used', async () => {
    const { controller, idOf } = await setup()
    await controller.fill({ fieldIds: [idOf('First name')] })

    const first = controller.getState().fields.find((field) => field.label === 'First name')
    expect(first).toMatchObject({ hasValue: true, currentValue: { kind: 'text', text: 'Ada' } })
    expect(controller.getState().decisions[idOf('First name')]).toEqual({
      action: 'skip',
      reason: 'Already filled with this answer.',
    })
    const used = controller.store.getSnapshot().answers.find((answer) => answer.label === 'First name')
    expect(used).toMatchObject({ usageCount: 1 })
    expect(used?.lastUsedAt).not.toBeNull()
  })

  it('does not change a consent field unless it is selected itself', async () => {
    const { controller, idOf } = await setup({
      settings: { mode: 'trusted', trusted: { sites: ['localhost'] } },
    })
    const terms = idOf('I agree')
    expect(controller.getState().decisions[terms]?.action).toBe('confirm')

    await controller.fill()
    expect(pageValues().terms).toBe(false)
    await controller.fill({ fieldIds: [terms] })
    expect(pageValues().terms).toBe(true)
  })

  it('fills high-confidence answers without selection only in trusted mode on a trusted site', async () => {
    const { controller, byField } = await setup({
      settings: { mode: 'trusted', trusted: { sites: ['localhost'] } },
    })
    const results = await controller.fill()
    expect(byField(results)).toEqual({
      'First name': ['filled', null],
      Email: ['filled', null],
      Country: ['filled', null],
      'Will you require sponsorship?': ['filled', null],
    })
    expect(pageValues()).toMatchObject({ last: 'Existing', terms: false, pw: '' })

    await controller.store.settings.update({ trusted: { sites: ['example.org'] } })
    await controller.undo()
    expect(await controller.fill()).toEqual([])
    expect(pageValues()).toEqual(UNTOUCHED)
  })

  it('changes nothing in suggest mode, even for selected fields', async () => {
    const { controller, allIds, idOf } = await setup({ settings: { mode: 'suggest' } })
    const results = await controller.fill({ fieldIds: allIds() })
    expect(results.find((result) => result.fieldId === idOf('First name'))).toMatchObject({
      status: 'skipped',
      reason: 'Suggest mode shows answers without changing the page.',
    })
    expect(results.every((result) => result.status === 'skipped')).toBe(true)
    expect(pageValues()).toEqual(UNTOUCHED)
  })

  it('overwrites an existing value only when overwriting is enabled', async () => {
    const { controller, idOf } = await setup({ settings: { overwriteExisting: true } })
    await controller.fill({ fieldIds: [idOf('Last name')] })
    expect(pageValues().last).toBe('Lovelace')
  })

  it('settles an ambiguous field with the answer the user picks', async () => {
    const { controller, idOf, byField } = await setup({
      answers: [
        { label: 'Notice period', value: { kind: 'text', text: '30 days' } },
        { label: 'Notice period', value: { kind: 'text', text: 'Two weeks' } },
      ],
    })
    const notice = idOf('Notice period')
    expect(controller.getState().decisions[notice]?.action).toBe('suggest')
    expect(byField(await controller.fill({ fieldIds: [notice] }))).toEqual({
      'Notice period': ['skipped', expect.stringContaining('Choose one')],
    })

    const twoWeeks = controller.store
      .getSnapshot()
      .answers.find((answer) => answer.value.kind === 'text' && answer.value.text === 'Two weeks')
    expect(
      byField(await controller.fill({ fieldIds: [notice], choices: { [notice]: 'unknown' } })),
    ).toEqual({ 'Notice period': ['skipped', 'That saved answer does not fit this field.'] })
    await controller.fill({ fieldIds: [notice], choices: { [notice]: twoWeeks?.id ?? '' } })
    expect(pageValues().notice).toBe('Two weeks')
  })

  it('applies policies registered by the host', async () => {
    const registry = new PluginRegistry().registerPolicy({
      id: 'test.no-email',
      apiVersion: PLUGIN_API_VERSION,
      evaluate: ({ field }) =>
        field.semanticKey === 'email' ? { action: 'block', reason: 'Email stays manual.' } : null,
    })
    const { controller, idOf, byField } = await setup({ registry })
    expect(byField(await controller.fill({ fieldIds: [idOf('Email')] }))).toEqual({
      Email: ['skipped', 'Email stays manual.'],
    })
    expect(pageValues().email).toBe('')
  })

  it('reports requested fields that are no longer on the page', async () => {
    const { controller } = await setup()
    expect(await controller.fill({ fieldIds: ['gone'] })).toEqual([
      {
        fieldId: 'gone',
        status: 'skipped',
        reason: 'The field is no longer on the page.',
        verified: false,
        snapshotId: null,
      },
    ])
  })

  it('undoes the latest fill', async () => {
    const { controller, allIds } = await setup()
    const events: AutofillEvent[] = []
    controller.on('restore:complete', (event) => events.push(event))
    await controller.fill({ fieldIds: allIds() })

    const restored = await controller.undo()
    expect(restored.map((result) => result.status)).toEqual(
      restored.map(() => 'restored' as const),
    )
    expect(restored).toHaveLength(5)
    expect(pageValues()).toEqual(UNTOUCHED)
    expect(controller.getState()).toMatchObject({ canUndo: false, filling: false })
    expect(events).toEqual([{ type: 'restore:complete', results: restored }])
    expect(await controller.undo()).toEqual([])
  })

  it('runs page actions one at a time', async () => {
    const { controller, idOf } = await setup()
    const [first, second] = await Promise.all([
      controller.fill({ fieldIds: [idOf('First name')] }),
      controller.fill({ fieldIds: [idOf('First name')] }),
    ])
    expect(first).toMatchObject([{ status: 'filled' }])
    expect(second).toMatchObject([{ status: 'skipped', reason: 'Already filled with this answer.' }])
  })

  it('refuses to fill before connecting and reports driver failures', async () => {
    const driver = createDomPageDriver({ observe: false })
    const idle = createAutofill({ driver, storage: createMemoryStorage() })
    await expect(idle.fill()).rejects.toMatchObject({ code: 'CONTENT_UNAVAILABLE' })
    await idle.destroy()

    const failing = createDomPageDriver({ observe: false })
    vi.spyOn(failing, 'fill').mockRejectedValue(new Error('page crashed'))
    const { controller, idOf } = await setup({ driver: failing })
    const errors: AutofillEvent[] = []
    controller.on('error', (event) => errors.push(event))
    await expect(controller.fill({ fieldIds: [idOf('First name')] })).rejects.toThrow('page crashed')
    expect(controller.getState().filling).toBe(false)
    expect(errors).toEqual([{ type: 'error', code: 'UNKNOWN', message: 'page crashed' }])
  })
})
