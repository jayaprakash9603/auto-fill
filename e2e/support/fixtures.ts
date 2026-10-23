import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  chromium,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
export const EXTENSION_DIR = resolve(repoRoot, 'apps/chrome-extension/dist-e2e')
const FORMS_DIR = resolve(repoRoot, 'fixtures/forms')

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
}

function startFixtureServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
    const file = normalize(resolve(FORMS_DIR, `.${pathname}`))
    if (!file.startsWith(FORMS_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found')
      return
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    })
    createReadStream(file).pipe(response)
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolvePromise({ server, origin: `http://127.0.0.1:${port}` })
    })
  })
}

interface WorkerFixtures {
  forms: { origin: string; url(name: string): string }
}

interface TestFixtures {
  /** Unpacked extension to load; defaults to the standalone E2E build. */
  extensionDir: string
  context: BrowserContext
  serviceWorker: Worker
  extensionId: string
  /** Opens an extension page in a normal tab, optionally pinned to a page tab. */
  openExtensionPage(path: string, target?: Page): Promise<Page>
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  forms: [
    async ({}, use) => {
      const { server, origin } = await startFixtureServer()
      await use({ origin, url: (name) => `${origin}/${name}` })
      await new Promise((done) => server.close(done))
    },
    { scope: 'worker' },
  ],
  extensionDir: [EXTENSION_DIR, { option: true }],
  context: async ({ extensionDir }, use) => {
    if (!existsSync(resolve(extensionDir, 'manifest.json')))
      throw new Error(`Build the extension first: ${extensionDir}`)
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    })
    await use(context)
    await context.close()
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await use(worker)
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host)
  },
  openExtensionPage: async ({ context, extensionId, serviceWorker }, use) => {
    await use(async (path, target) => {
      let query = ''
      if (target) {
        const targetUrl = target.url()
        const tabId = await serviceWorker.evaluate(
          async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id ?? null,
          targetUrl,
        )
        if (tabId == null) throw new Error(`No tab found for ${targetUrl}`)
        query = `?tabId=${tabId}`
      }
      const page = await context.newPage()
      await page.goto(`chrome-extension://${extensionId}/${path}${query}`)
      return page
    })
  },
})

export { expect } from '@playwright/test'
