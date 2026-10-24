import { addAnswer } from './support/data'
import { expect, test } from './support/fixtures'

test.describe('synthetic and clear', () => {
  test('generates preview when enabled and clears with undo', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))
    await page.fill('#email', 'keep@example.com')

    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    await addAnswer(panel, 'First name', 'Real name')
    await panel.getByRole('tab', { name: 'Page' }).click()
    const list = panel.getByRole('region', { name: 'Detected fields' })
    await expect(list).toContainText('First name')

    await panel.getByRole('tab', { name: 'Data' }).click()
    await expect(panel.getByRole('heading', { name: 'Filling' })).toBeVisible()
    await panel.getByRole('switch', { name: 'Allow synthetic data' }).click()
    await panel.getByRole('switch', { name: 'Replace values that are already filled in' }).click()
    await panel.getByRole('tab', { name: 'Page' }).click()

    const first = list.locator('li', { hasText: 'First name' })
    await first.getByRole('checkbox').check()
    await panel.getByRole('button', { name: /Generate preview/i }).click()
    await expect(first.locator('[data-slot="match-proposal"]')).toContainText(/Generated preview|Hopper|Lovelace/i)

    await page.fill('#first-name', 'Before')
    await panel.getByRole('button', { name: 'Refresh' }).click()
    await expect(list).toContainText('First name')
    await first.getByRole('checkbox').check()

    await panel.getByRole('button', { name: /Clear selected/i }).click()
    await panel.getByRole('button', { name: 'Clear fields' }).click()
    await expect(page.locator('#first-name')).toHaveValue('')
    await expect(page.locator('#email')).toHaveValue('keep@example.com')

    await panel.getByRole('button', { name: 'Undo fill' }).click()
    await expect(page.locator('#first-name')).toHaveValue('Before')
  })
})
