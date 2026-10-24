import {
  AutofillError,
  type ClearOperationInput,
  type ControlTarget,
  type FieldDescriptor,
  type FillOperationInput,
} from '@ufa/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFormActions } from './executor'
import { $, mount, target } from './test-utils/targets'

afterEach(() => {
  document.body.innerHTML = ''
})

const text = (value: string) => ({ kind: 'text', text: value }) as const

/** A small form whose controls are registered under readable field ids. */
function setup(fields: Record<string, { selector: string; field?: Partial<FieldDescriptor> }>) {
  mount(`
    <input id="first" />
    <input id="last" value="Lovelace" />
    <input id="pw" type="password" />
    <input id="terms" type="checkbox" />
    <input id="hidden" />
    <input id="readonly" readonly />
    <input id="other" />`)
  const targets = new Map<string, ControlTarget>()
  for (const [id, { selector, field }] of Object.entries(fields)) {
    const element = $(selector)
    const type = element.getAttribute('type') === 'checkbox' ? 'checkbox' : 'text'
    targets.set(id, target(element, type, { field: { id, fingerprint: `fp-${id}`, ...field } }))
  }
  const resolve = vi.fn((fieldId: string, fingerprint?: string) => {
    const found = targets.get(fieldId)
    if (!found) throw new AutofillError('FIELD_NOT_FOUND', 'The field is no longer on the page.')
    if (fingerprint !== undefined && fingerprint !== found.field.fingerprint)
      throw new AutofillError('FIELD_CHANGED', 'The field changed since it was scanned.')
    return found
  })
  return { resolve, actions: createFormActions({ resolve, optionTimeoutMs: 200 }) }
}

const op = (fieldId: string, value: FillOperationInput['value'], extra: Partial<FillOperationInput> = {}) =>
  ({ fieldId, value, source: 'saved', ...extra }) satisfies FillOperationInput

const clearOp = (fieldId: string, extra: Partial<ClearOperationInput> = {}) =>
  ({ fieldId, explicitlySelected: true, ...extra }) satisfies ClearOperationInput

describe('createFormActions().fill', () => {
  it('fills eligible fields and refuses everything the safety rules forbid', async () => {
    const { actions } = setup({
      first: { selector: '#first' },
      last: { selector: '#last' },
      pw: {
        selector: '#pw',
        field: { sensitivity: 'prohibited', sensitivityReason: 'password' },
      },
      terms: { selector: '#terms', field: { sensitivity: 'consent' } },
      hidden: { selector: '#hidden', field: { visible: false } },
      readonly: { selector: '#readonly', field: { editable: false } },
    })

    const results = await actions.fill([
      op('first', text('Ada')),
      op('last', text('Byron')),
      op('pw', text('secret')),
      op('terms', { kind: 'checked', checked: true }),
      op('hidden', text('x')),
      op('readonly', text('x')),
      op('missing', text('x')),
    ])

    expect(results.map(({ fieldId, status, reason }) => [fieldId, status, reason])).toEqual([
      ['first', 'filled', null],
      ['last', 'skipped', 'Already has a value; it was kept.'],
      ['pw', 'skipped', 'Protected field (password): never filled.'],
      ['terms', 'skipped', 'Consent fields change only when you select them yourself.'],
      ['hidden', 'skipped', 'The field is hidden.'],
      ['readonly', 'skipped', 'The field cannot be edited.'],
      ['missing', 'failed', 'The field is no longer on the page.'],
    ])
    expect($<HTMLInputElement>('#first').value).toBe('Ada')
    expect($<HTMLInputElement>('#last').value).toBe('Lovelace')
    expect($<HTMLInputElement>('#pw').value).toBe('')
    expect($<HTMLInputElement>('#terms').checked).toBe(false)
    expect($<HTMLInputElement>('#hidden').value).toBe('')
  })

  it('changes a consent field only when the user selected it, and never with a generated value', async () => {
    const { actions } = setup({ terms: { selector: '#terms', field: { sensitivity: 'consent' } } })
    const agree = { kind: 'checked', checked: true } as const

    expect(
      await actions.fill([op('terms', agree, { explicitlySelected: true, source: 'generated' })]),
    ).toMatchObject([{ status: 'skipped', reason: 'Consent fields never receive generated values.' }])
    expect(await actions.fill([op('terms', agree, { explicitlySelected: true })])).toMatchObject([
      { status: 'filled', verified: true },
    ])
    expect($<HTMLInputElement>('#terms').checked).toBe(true)
  })

  it('overwrites a value only when allowed, and reports a value already in place', async () => {
    const { actions } = setup({ last: { selector: '#last' } })
    expect(await actions.fill([op('last', text('Lovelace'))])).toMatchObject([
      { status: 'unchanged', verified: true, reason: 'Already has this value.', snapshotId: null },
    ])
    expect(await actions.fill([op('last', text('Byron'), { allowOverwrite: true })])).toMatchObject([
      { status: 'filled', verified: true },
    ])
    expect($<HTMLInputElement>('#last').value).toBe('Byron')
  })

  it('refuses a field whose control changed since the scan', async () => {
    const { actions } = setup({ first: { selector: '#first' } })
    expect(await actions.fill([op('first', text('Ada'), { fingerprint: 'stale' })])).toMatchObject([
      { status: 'failed', reason: 'The field changed since it was scanned.' },
    ])
    expect($<HTMLInputElement>('#first').value).toBe('')
  })

  it('stops at a cancelled signal without touching the remaining fields', async () => {
    const { actions } = setup({ first: { selector: '#first' }, other: { selector: '#other' } })
    const controller = new AbortController()
    controller.abort()
    expect(
      await actions.fill([op('first', text('Ada')), op('other', text('x'))], controller.signal),
    ).toMatchObject([
      { status: 'skipped', reason: 'The fill was cancelled.' },
      { status: 'skipped', reason: 'The fill was cancelled.' },
    ])
    expect($<HTMLInputElement>('#first').value).toBe('')
  })

  it('uses a custom control adapter when one claims the field', async () => {
    mount('<input id="first" />')
    const first = target($('#first'), 'text', { field: { id: 'first' } })
    const fillField = vi.fn(async () => ({ ok: true, verified: true, reason: 'Adapter' }))
    const actions = createFormActions({ resolve: () => first, fillField })
    expect(await actions.fill([op('first', text('Ada'))])).toMatchObject([
      { status: 'filled', reason: 'Adapter' },
    ])
    expect(fillField).toHaveBeenCalledWith(first, text('Ada'))
  })
})

describe('createFormActions().restore', () => {
  it('puts back what a fill replaced and leaves fields the user changed since', async () => {
    const { actions } = setup({
      first: { selector: '#first' },
      last: { selector: '#last' },
      other: { selector: '#other' },
    })
    const results = await actions.fill([
      op('first', text('Ada')),
      op('last', text('Byron'), { allowOverwrite: true }),
      op('other', text('Analytical engine')),
    ])
    const snapshotId = results[0]?.snapshotId
    expect(snapshotId).toBeTruthy()
    expect(new Set(results.map((result) => result.snapshotId))).toEqual(new Set([snapshotId]))

    $<HTMLInputElement>('#other').value = 'Typed by the user'
    expect(await actions.restore(snapshotId ?? '')).toEqual([
      { fieldId: 'first', status: 'restored', reason: null },
      { fieldId: 'last', status: 'restored', reason: null },
      {
        fieldId: 'other',
        status: 'not-restorable',
        reason: 'Changed since it was filled; left as it is.',
      },
    ])
    expect($<HTMLInputElement>('#first').value).toBe('')
    expect($<HTMLInputElement>('#last').value).toBe('Lovelace')
    expect($<HTMLInputElement>('#other').value).toBe('Typed by the user')

    expect(await actions.restore(snapshotId ?? '')).toEqual([])
  })

  it('clears eligible fields and restores them with the same snapshot id', async () => {
    const { actions } = setup({
      first: {
        selector: '#first',
        field: { hasValue: true, currentValue: { kind: 'text', text: 'Ada' } },
      },
      last: {
        selector: '#last',
        field: { hasValue: true, currentValue: { kind: 'text', text: 'Lovelace' } },
      },
      terms: { selector: '#terms', field: { sensitivity: 'consent' } },
    })
    $<HTMLInputElement>('#first').value = 'Ada'
    const results = await actions.clear([clearOp('first'), clearOp('last')])
    expect(results.map((result) => result.status)).toEqual(['cleared', 'cleared'])
    const snapshotId = results[0]?.snapshotId
    expect(snapshotId).toBeTruthy()
    expect($<HTMLInputElement>('#first').value).toBe('')
    expect($<HTMLInputElement>('#last').value).toBe('')
    expect(await actions.restore(snapshotId ?? '')).toEqual([
      { fieldId: 'first', status: 'restored', reason: null },
      { fieldId: 'last', status: 'restored', reason: null },
    ])
  })

  it('keeps only the newest snapshots', async () => {
    mount('<input id="first" />')
    const first = target($('#first'), 'text', { field: { id: 'first' } })
    const actions = createFormActions({ resolve: () => first, maxSnapshots: 2 })
    const ids: string[] = []
    for (const value of ['a', 'b', 'c']) {
      const [result] = await actions.fill([op('first', text(value), { allowOverwrite: true })])
      ids.push(result?.snapshotId ?? '')
    }
    expect(await actions.restore(ids[0] ?? '')).toEqual([])
    expect(await actions.restore(ids[2] ?? '')).toEqual([
      { fieldId: 'first', status: 'restored', reason: null },
    ])
    expect($<HTMLInputElement>('#first').value).toBe('b')
  })
})
