import { createDomPageDriver, type RuntimeRequest } from '@ufa/autofill-sdk'
import type { FieldDescriptor } from '@ufa/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createExtensionAutofillHost } from './host'
import { createExtensionTabDriver } from './tab-driver'
import { originPattern } from './tabs'
import { createFakeChrome } from './test-utils/fake-chrome'

let fake: ReturnType<typeof createFakeChrome> | null = null
afterEach(() => {
  fake?.cleanup()
  fake = null
})

describe('extension tab driver', () => {
  it('injects the runtime into all frames and pings it', async () => {
    fake = createFakeChrome()
    const driver = createExtensionTabDriver({
      chrome: fake.chrome,
      contentScriptFile: 'form-autofill/content-script.js',
    })
    const page = await driver.connect()
    expect(page.runtimeVersion).toMatch(/\d+\.\d+\.\d+/)
    expect(driver.tabId).toBe(7)
    expect(driver.frameIds).toEqual([0])
    expect(fake.injections[0]).toEqual({
      target: { tabId: 7, allFrames: true },
      files: ['form-autofill/content-script.js'],
    })
  })

  it('refuses browser pages', async () => {
    fake = createFakeChrome({ tabs: [{ id: 1, url: 'chrome://settings', active: true }] })
    const driver = createExtensionTabDriver({ chrome: fake.chrome, contentScriptFile: 'cs.js' })
    await expect(driver.connect()).rejects.toMatchObject({ code: 'RESTRICTED_PAGE' })
  })

  it('reports missing host permission as PERMISSION_REQUIRED with the site', async () => {
    fake = createFakeChrome({
      injectError:
        'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    })
    const driver = createExtensionTabDriver({ chrome: fake.chrome, contentScriptFile: 'cs.js' })
    await expect(driver.connect()).rejects.toMatchObject({
      code: 'PERMISSION_REQUIRED',
      details: { site: 'jobs.example.com' },
    })
  })

  it('targets the active tab even when the browser hides its URL, instead of another tab', async () => {
    fake = createFakeChrome({
      tabs: [
        { id: 3, active: true, windowId: 1 },
        {
          id: 4,
          url: 'https://visible.example.com/',
          active: false,
          windowId: 1,
          lastAccessed: 99,
        },
      ],
      injectError:
        'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    })
    const driver = createExtensionTabDriver({ chrome: fake.chrome, contentScriptFile: 'cs.js' })
    await expect(driver.connect()).rejects.toMatchObject({
      code: 'PERMISSION_REQUIRED',
      details: { site: null },
    })
    expect(fake.injections[0]).toMatchObject({ target: { tabId: 3 } })
  })

  it('flags file URLs that need the file access toggle', async () => {
    fake = createFakeChrome({
      tabs: [{ id: 5, url: 'file:///C:/forms/apply.html', active: true }],
      injectError: 'Cannot access contents of url "file:///C:/forms/apply.html".',
    })
    const driver = createExtensionTabDriver({ chrome: fake.chrome, contentScriptFile: 'cs.js' })
    await expect(driver.connect()).rejects.toMatchObject({
      code: 'PERMISSION_REQUIRED',
      details: { reason: 'file-access' },
    })
  })

  it('forwards navigation of the connected tab and detaches listeners on dispose', async () => {
    fake = createFakeChrome()
    const driver = createExtensionTabDriver({ chrome: fake.chrome, contentScriptFile: 'cs.js' })
    const listener = vi.fn()
    driver.subscribe(listener)
    await driver.connect()
    fake.events.onUpdated.fire(7, { url: 'https://jobs.example.com/step-2' }, { id: 7 })
    fake.events.onUpdated.fire(99, { url: 'https://other.example' }, { id: 99 })
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: 'navigated',
      url: 'https://jobs.example.com/step-2',
    })
    await driver.dispose()
    expect(fake.events.onUpdated.size()).toBe(0)
    expect(fake.events.onMessage.size()).toBe(0)
  })

  it('scans reachable frames and tags fields and change events with their frame', async () => {
    document.body.innerHTML = '<label for="x">Email</label><input id="x" type="email" />'
    fake = createFakeChrome()
    const driver = createExtensionTabDriver({ chrome: fake.chrome, contentScriptFile: 'cs.js' })
    await expect(driver.scan()).rejects.toMatchObject({ code: 'CONTENT_UNAVAILABLE' })

    const listener = vi.fn()
    driver.subscribe(listener)
    await driver.connect()
    const result = await driver.scan()
    expect(result.fields.map((field) => [field.label, field.type, field.frameId])).toEqual([
      ['Email', 'email', 0],
    ])
    expect(result.page.frameCount).toBe(1)

    document.getElementById('x')!.remove()
    await vi.waitFor(
      () =>
        expect(listener).toHaveBeenCalledWith({ type: 'fields-changed', frameId: 0, fields: [] }),
      { timeout: 2_000 },
    )
    document.body.innerHTML = ''
  })

  it('fills and restores through the page runtime', async () => {
    document.body.innerHTML = '<label for="x">Email</label><input id="x" type="email" />'
    fake = createFakeChrome()
    const driver = createExtensionTabDriver({ chrome: fake.chrome, contentScriptFile: 'cs.js' })
    await expect(driver.fill([])).rejects.toMatchObject({ code: 'CONTENT_UNAVAILABLE' })
    await driver.connect()
    const [email] = (await driver.scan()).fields
    const input = document.getElementById('x') as HTMLInputElement

    const [result] = await driver.fill([
      { fieldId: email!.id, value: { kind: 'text', text: 'ada@example.com' }, source: 'saved' },
    ])
    expect(result).toMatchObject({ status: 'filled', verified: true })
    expect(input.value).toBe('ada@example.com')
    expect(await driver.restore(result!.snapshotId!)).toEqual([
      { fieldId: email!.id, status: 'restored', reason: null },
    ])
    expect(input.value).toBe('')
    document.body.innerHTML = ''
  })

  describe('with several frames', () => {
    async function framedDriver(failingFrame?: number) {
      document.body.innerHTML = '<label for="x">Email</label><input id="x" type="email" />'
      const [template] = (await createDomPageDriver({ observe: false }).scan()).fields
      const page = await createDomPageDriver().connect()
      document.body.innerHTML = ''
      const frames: Record<number, FieldDescriptor[]> = {
        0: [{ ...template!, id: 'top-email' }],
        2: [{ ...template!, id: 'frame-email' }],
      }
      const requests: { frameId: number; request: RuntimeRequest }[] = []
      fake = createFakeChrome()
      fake.chrome.scripting.executeScript = async () => [{ frameId: 0 }, { frameId: 2 }]
      fake.chrome.tabs.sendMessage = async (_tabId, message, options) => {
        const frameId = options?.frameId ?? 0
        const request = message as RuntimeRequest
        requests.push({ frameId, request })
        if (request.type === 'fill' && frameId === failingFrame) throw new Error('Frame gone')
        switch (request.type) {
          case 'ping':
            return { ok: true, data: page }
          case 'scan':
            return { ok: true, data: { page, fields: frames[frameId], scannedAt: 1 } }
          case 'fill':
            return {
              ok: true,
              data: request.operations.map((operation) => ({
                fieldId: operation.fieldId,
                status: 'filled',
                reason: null,
                verified: true,
                snapshotId: `snap-${frameId}`,
              })),
            }
          case 'restore':
            return {
              ok: true,
              data: [{ fieldId: frames[frameId]?.[0]?.id, status: 'restored', reason: null }],
            }
        }
      }
      const driver = createExtensionTabDriver({ chrome: fake.chrome, contentScriptFile: 'cs.js' })
      await driver.connect()
      await driver.scan()
      return { driver, requests }
    }

    const value = { kind: 'text', text: 'ada@example.com' } as const

    it('sends each operation to the frame that owns the field, top frame first', async () => {
      const { driver, requests } = await framedDriver()
      const results = await driver.fill([
        { fieldId: 'frame-email', value, source: 'saved' },
        { fieldId: 'top-email', value, source: 'saved' },
        { fieldId: 'unknown', value, source: 'saved' },
      ])
      expect(results.map((result) => [result.fieldId, result.status, result.reason])).toEqual([
        ['frame-email', 'filled', null],
        ['top-email', 'filled', null],
        ['unknown', 'failed', 'The field is no longer on the page.'],
      ])
      const fills = requests.filter(({ request }) => request.type === 'fill')
      expect(
        fills.map(({ frameId, request }) => [
          frameId,
          request.type === 'fill' && request.operations.map((operation) => operation.fieldId),
        ]),
      ).toEqual([
        [0, ['top-email']],
        [2, ['frame-email']],
      ])

      const snapshotIds = new Set(results.map((result) => result.snapshotId).filter(Boolean))
      expect(snapshotIds.size).toBe(1)
      const [snapshotId] = snapshotIds
      expect(await driver.restore(snapshotId!)).toEqual([
        { fieldId: 'top-email', status: 'restored', reason: null },
        { fieldId: 'frame-email', status: 'restored', reason: null },
      ])
      expect(
        requests
          .filter(({ request }) => request.type === 'restore')
          .map(({ frameId, request }) => [frameId, request.type === 'restore' && request.snapshotId]),
      ).toEqual([
        [0, 'snap-0'],
        [2, 'snap-2'],
      ])
      expect(await driver.restore(snapshotId!)).toEqual([])
    })

    it('reports the fields of a frame that fails, and still fills the others', async () => {
      const { driver } = await framedDriver(2)
      const results = await driver.fill([
        { fieldId: 'top-email', value, source: 'saved' },
        { fieldId: 'frame-email', value, source: 'saved' },
      ])
      expect(results.map((result) => [result.fieldId, result.status, result.reason])).toEqual([
        ['top-email', 'filled', null],
        ['frame-email', 'failed', 'Frame gone'],
      ])
    })
  })
})

describe('extension host', () => {
  it('creates controllers that connect through chrome APIs and lazily creates storage', async () => {
    fake = createFakeChrome()
    const host = createExtensionAutofillHost({
      chrome: fake.chrome,
      contentScriptFile: 'cs.js',
      storageNamespace: 'test',
    })
    const controller = host.createController()
    await controller.connect()
    expect(controller.getState().status).toBe('ready')
    await host.getStorage().set('probe', 1)
    expect(await fake.chrome.storage?.local.get('test:probe')).toEqual({ 'test:probe': 1 })
    await controller.destroy()
  })

  it('requests access for the current origin only', async () => {
    fake = createFakeChrome()
    const request = vi.spyOn(fake.chrome.permissions!, 'request')
    const host = createExtensionAutofillHost({
      chrome: fake.chrome,
      contentScriptFile: 'cs.js',
      storageNamespace: 'test',
    })
    await expect(host.requestPageAccess()).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ origins: ['https://jobs.example.com/*'] })
    expect(originPattern('file:///tmp/a.html')).toBeNull()
  })
})
