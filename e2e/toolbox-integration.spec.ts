import { resolve } from 'node:path'

import type { Page } from '@playwright/test'

import { expect, test } from './support/fixtures'

/*
 * Runs the Form Autofill tool inside a built Browser Toolbox (or any host that registers the
 * packaged panel at the same route). Opt-in so this repository stays independent of its hosts:
 *   UFA_TOOLBOX_DIST=../dist pnpm e2e toolbox-integration
 */
const toolboxDist = process.env.UFA_TOOLBOX_DIST ? resolve(process.env.UFA_TOOLBOX_DIST) : undefined
const TOOL_URL = 'index.html#/tools/productivity/form-autofill'

const readFormState = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')].map((field) =>
      field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value,
    ),
  )

test.describe('Browser Toolbox integration', () => {
  test.skip(!toolboxDist, 'Set UFA_TOOLBOX_DIST to a built Browser Toolbox dist folder.')
  test.use({ extensionDir: toolboxDist ?? '' })

  test('the Form Autofill tool connects to the active tab and follows the toolbox theme', async ({
    context,
    serviceWorker,
    forms,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))
    const before = await readFormState(page)

    // A popup window keeps the form's normal window as the last focused one, like a side panel.
    const panelOpened = context.waitForEvent('page')
    await serviceWorker.evaluate(
      (url) =>
        chrome.windows.create({
          url: chrome.runtime.getURL(url),
          type: 'popup',
          width: 420,
          height: 760,
        }),
      TOOL_URL,
    )
    const panel = await panelOpened

    await expect(panel.getByRole('heading', { level: 1, name: 'Form Autofill' })).toBeVisible()
    await expect(panel.getByText('Connected')).toBeVisible()
    await expect(panel.getByText('Simple application')).toBeVisible()
    await expect(panel.getByText('2 frames')).toBeVisible()
    const fields = panel.getByRole('region', { name: 'Detected fields' })
    await expect(fields.getByText('8 fields')).toBeVisible()
    await expect(fields.getByText('LinkedIn profile')).toBeVisible()
    // Only the toolbox page title is visible; the panel heading is kept for screen readers.
    await expect(panel.getByRole('heading', { level: 2, name: 'Form Autofill' })).toHaveClass(
      /ufa:sr-only/,
    )

    const root = panel.locator('.ufa-root:not([data-ufa-portal])')
    const primaries = () =>
      panel.evaluate(() => ({
        host: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
        panel: getComputedStyle(document.querySelector('.ufa-root:not([data-ufa-portal])')!)
          .getPropertyValue('--ufa-primary')
          .trim(),
      }))

    const initial = await primaries()
    expect(initial.panel).toBe(initial.host)

    const scheme = await root.getAttribute('data-ufa-scheme')
    await panel.evaluate(() => document.documentElement.classList.toggle('dark'))
    await expect(root).toHaveAttribute('data-ufa-scheme', scheme === 'dark' ? 'light' : 'dark')
    const toggled = await primaries()
    expect(toggled.panel).toBe(toggled.host)

    expect(await readFormState(page)).toEqual(before)
  })
})
