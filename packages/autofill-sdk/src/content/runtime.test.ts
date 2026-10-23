import { afterEach, describe, expect, it } from 'vitest'

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
    expect(states).toEqual(['connecting', 'ready'])
    await controller.destroy()
    await expect(controller.connect()).rejects.toThrow(/destroyed/)
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
