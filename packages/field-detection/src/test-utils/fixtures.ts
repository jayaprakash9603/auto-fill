import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JSDOM } from 'jsdom'

const FORMS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../fixtures/forms')

export interface LoadedFixture {
  window: Window & typeof globalThis
  document: Document
  close(): void
}

/**
 * Loads a fixture page into its own jsdom window with scripts enabled, so custom elements,
 * shadow roots and step transitions behave as they do in a browser (minus layout).
 */
export function loadFixture(name: string): LoadedFixture {
  return loadHtml(readFileSync(resolve(FORMS_DIR, name), 'utf8'), name)
}

export function loadHtml(html: string, path = 'inline.html'): LoadedFixture {
  const dom = new JSDOM(html, {
    url: `http://127.0.0.1/${path}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  })
  const window = dom.window as unknown as Window & typeof globalThis
  return { window, document: window.document, close: () => dom.window.close() }
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
