import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FieldDescriptor } from '@ufa/core'
import { createMemoryStorage } from '@ufa/storage'

import { createAutofill } from '../controller/create-autofill'
import { createDomPageDriver } from '../dom/dom-page-driver'
import {
  createRequest,
  readResponse,
  type RuntimeEventEnvelope,
  type RuntimeResponse,
} from '../protocol/messages'
import {
  installAutofillContentRuntime,
  type ContentRuntimeHandle,
  type RuntimeMessagePort,
} from './runtime'

function createLoopbackPort() {
  let listener: ((message: unknown) => Promise<RuntimeResponse> | undefined) | null = null
  const emitted: RuntimeEventEnvelope[] = []
  const port: RuntimeMessagePort = {
    onMessage(next) {
      listener = next
      return () => {
        listener = null
      }
    },
    emit(envelope) {
      emitted.push(envelope)
    },
  }
  const send = (message: unknown) => listener?.(message)
  return { port, send, emitted }
}

let handle: ContentRuntimeHandle | null = null
afterEach(() => {
  handle?.dispose()
  handle = null
})

describe('content runtime', () => {
  it('answers ping requests with page information', async () => {
    document.title = 'Fixture form'
    const loop = createLoopbackPort()
    handle = installAutofillContentRuntime({ port: loop.port })
    const raw = await loop.send(createRequest('ping', {}))
    const page = readResponse('ping', raw)
    expect(page.title).toBe('Fixture form')
    expect(page.runtimeVersion).toBe(handle.version)
  })

  it('ignores foreign messages and rejects malformed protocol requests', async () => {
    const loop = createLoopbackPort()
    handle = installAutofillContentRuntime({ port: loop.port })
    expect(loop.send({ type: 'GET_PAGE_INFO' })).toBeUndefined()
    const raw = await loop.send({
      channel: 'ufa/v1',
      kind: 'request',
      type: 'nope',
      requestId: 'x',
    })
    expect(() => readResponse('ping', raw)).toThrow(/Malformed request/)
  })

  it('is idempotent when injected twice', () => {
    const loop = createLoopbackPort()
    handle = installAutofillContentRuntime({ port: loop.port })
    expect(installAutofillContentRuntime({ port: loop.port })).toBe(handle)
  })

  it('answers scan requests and then reports structural changes as events', async () => {
    document.body.innerHTML = `
      <form>
        <label for="name">Full name</label><input id="name" name="name" />
        <div id="more" hidden><label for="site">Website</label><input id="site" type="url" /></div>
      </form>`
    const loop = createLoopbackPort()
    handle = installAutofillContentRuntime({ port: loop.port })
    const raw = await loop.send(
      createRequest('scan', { request: { includeHidden: false, includeDisabled: false } }),
    )
    const result = readResponse('scan', raw)
    expect(result.fields.map((field) => field.label)).toEqual(['Full name'])

    document.getElementById('name')!.setAttribute('value', 'typed')
    document.getElementById('more')!.hidden = false
    await vi.waitFor(() => expect(loop.emitted).toHaveLength(1), { timeout: 2_000 })
    const event = loop.emitted[0]!.event
    expect(event).toMatchObject({ type: 'fields-changed', frameId: null })
    expect(event.type === 'fields-changed' && event.fields.map((field) => field.label)).toEqual([
      'Full name',
      'Website',
    ])
    document.body.innerHTML = ''
  })
})

describe('createAutofill', () => {
  it('connects through the injected driver and reports state', async () => {
    const controller = createAutofill({
      driver: createDomPageDriver(),
      storage: createMemoryStorage(),
    })
    const states: string[] = []
    controller.subscribe((state) => states.push(state.status))
    const page = await controller.connect()
    expect(page?.adapterId).toBe('generic')
    expect(controller.getState().status).toBe('ready')
    expect(states.filter((status, index) => status !== states[index - 1])).toEqual([
      'connecting',
      'ready',
    ])
    await controller.destroy()
    await expect(controller.connect()).rejects.toThrow(/destroyed/)
  })

  it('scans after connecting and merges field updates per frame', async () => {
    document.body.innerHTML = '<label for="a">Email</label><input id="a" type="email" />'
    const driver = createDomPageDriver({ observe: false })
    const controller = createAutofill({ driver, storage: createMemoryStorage() })
    const events: string[] = []
    controller.on('scan:complete', (event) => events.push(`scan:${event.fieldCount}`))
    controller.on('fields:changed', (event) => events.push(`changed:${event.fieldCount}`))
    await controller.connect()
    const [email] = controller.getState().fields
    expect(email).toMatchObject({ label: 'Email', type: 'email', frameId: null })
    expect(controller.getState()).toMatchObject({ scanning: false, status: 'ready' })

    const frameField = { ...email!, id: 'frame-1-field', frameId: 1, label: 'LinkedIn' }
    driver.emit({ type: 'fields-changed', frameId: 1, fields: [frameField] })
    expect(controller.getState().fields.map((field) => field.label)).toEqual(['Email', 'LinkedIn'])
    driver.emit({ type: 'fields-changed', frameId: 1, fields: [] })
    expect(controller.getState().fields.map((field) => field.label)).toEqual(['Email'])
    expect(events).toEqual(['scan:1', 'changed:2', 'changed:1'])

    driver.emit({ type: 'navigated', url: 'http://localhost/next' })
    expect(controller.getState().fields).toEqual([])
    await vi.waitFor(() => expect(controller.getState().fields).toHaveLength(1))
    await controller.destroy()
    document.body.innerHTML = ''
  })

  it('keeps a frame report that arrives while a scan is still running', async () => {
    const driver = createDomPageDriver({ observe: false })
    const report = { frameId: 3, fields: [] as FieldDescriptor[] }
    driver.scan = async () => {
      driver.emit({ type: 'fields-changed', frameId: report.frameId, fields: report.fields })
      return {
        page: await driver.connect(),
        fields: [],
        scannedAt: 1,
      }
    }
    document.body.innerHTML = '<input aria-label="Stale" />'
    const scanner = createDomPageDriver({ observe: false })
    const [stale] = (await scanner.scan()).fields
    report.fields = [{ ...stale!, frameId: 3, label: 'Fresh' }]
    const controller = createAutofill({ driver, storage: createMemoryStorage() })
    await controller.connect()
    expect(controller.getState().fields.map((field) => field.label)).toEqual(['Fresh'])
    await controller.destroy()
    document.body.innerHTML = ''
  })

  it('surfaces driver failures as error state', async () => {
    const driver = createDomPageDriver()
    driver.connect = () => Promise.reject(new Error('no access'))
    const controller = createAutofill({ driver, storage: createMemoryStorage() })
    await controller.connect()
    expect(controller.getState()).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN', message: 'no access' },
    })
  })
})
