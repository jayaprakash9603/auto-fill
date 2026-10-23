import { expect, test } from './support/fixtures'

test.describe('extension shell', () => {
  test('loads the background worker with only the declared permissions', async ({
    serviceWorker,
  }) => {
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest())
    expect(manifest.manifest_version).toBe(3)
    expect([...(manifest.permissions ?? [])].sort()).toEqual([
      'activeTab',
      'scripting',
      'sidePanel',
      'storage',
    ])
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*'])
  })

  test('side panel injects the runtime and reports the page, including same-origin frames', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))
    await expect(page.frameLocator('iframe').locator('#linkedin')).toBeVisible()

    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    await expect(panel.getByText('Connected')).toBeVisible()
    await expect(panel.getByText('Simple application')).toBeVisible()
    await expect(panel.getByText('127.0.0.1')).toBeVisible()
    await expect(panel.getByText('2 frames')).toBeVisible()
    await expect(panel.getByText('Portal: Generic')).toBeVisible()
  })

  test('reconnecting reuses the injected runtime and leaves the page untouched', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))
    const before = await page.content()

    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    await expect(panel.getByText('Connected')).toBeVisible()
    await panel.getByRole('button', { name: 'Refresh' }).click()
    await expect(panel.getByText('Connected')).toBeVisible()
    await expect(panel.getByText('2 frames')).toBeVisible()

    expect(await page.content()).toBe(before)
    expect(await page.locator('#first-name').inputValue()).toBe('')
  })

  test('follows navigation of the connected tab', async ({ context, forms, openExtensionPage }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))
    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    await expect(panel.getByText('Simple application')).toBeVisible()

    await page.goto(forms.url('frame-questions.html'))
    await expect(panel.getByText('Embedded questions')).toBeVisible()
    await expect(panel.getByText('1 frame')).toBeVisible()
  })

  test('options page lists site access', async ({ openExtensionPage }) => {
    const options = await openExtensionPage('src/options/index.html')
    await expect(options.getByRole('heading', { name: 'Universal Form Autofill' })).toBeVisible()
    await options.getByRole('tab', { name: 'Site access & privacy' }).click()
    const sites = options.getByRole('list', { name: 'Allowed sites' })
    await expect(sites.getByText('http://127.0.0.1/*')).toBeVisible()
    await expect(sites.getByText('Required').first()).toBeVisible()
  })
})
