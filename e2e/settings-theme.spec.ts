import { chooseOption } from './support/data'
import { expect, test } from './support/fixtures'

test.describe('side panel settings', () => {
  test('narrow side panel reaches every section and its theme is shared with the options page', async ({
    openExtensionPage,
  }) => {
    const panel = await openExtensionPage('src/sidepanel/index.html')
    await panel.setViewportSize({ width: 320, height: 700 })
    const root = panel.locator('.ufa-root:not([data-ufa-portal])')
    await expect(root).toHaveAttribute('data-ufa-scheme', /light|dark/)

    await panel.getByRole('tab', { name: 'Settings' }).click()
    await expect(panel.getByText('Site access', { exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Open full settings page' })).toBeVisible()
    expect(await panel.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    )

    await chooseOption(panel, panel.getByRole('combobox', { name: 'Theme' }), 'Dark')
    await expect(root).toHaveAttribute('data-ufa-scheme', 'dark')

    const options = await openExtensionPage('src/options/index.html#access')
    await expect(options.locator('.ufa-root:not([data-ufa-portal])')).toHaveAttribute(
      'data-ufa-scheme',
      'dark',
    )
    await chooseOption(options, options.getByRole('combobox', { name: 'Theme' }), 'Light')
    await expect(root).toHaveAttribute('data-ufa-scheme', 'light')
  })

  test('the toolbar button opens the side panel without a popup', async ({ serviceWorker }) => {
    const behavior = await serviceWorker.evaluate(() => chrome.sidePanel.getPanelBehavior())
    expect(behavior.openPanelOnActionClick).toBe(true)
  })
})
