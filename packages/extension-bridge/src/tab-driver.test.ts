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
