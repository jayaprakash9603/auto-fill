import { expect, test } from './support/fixtures'

test.describe('learning', () => {
  test('saves a typed answer after the user confirms it', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))

    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    await panel.getByRole('tab', { name: 'Page' }).click()
    await panel.getByRole('switch', { name: 'Learn from this page' }).click()
    await page.locator('#phone').pressSequentially('555-010-1234')
    await expect(panel.getByRole('button', { name: /Review/i })).toBeVisible({ timeout: 15_000 })
    await panel.getByRole('button', { name: /Review/i }).click()
    const dialog = panel.getByRole('dialog', { name: 'Save this answer?' })
    await dialog.getByRole('button', { name: 'Save answer' }).click()
    await expect(dialog).toBeHidden()

    await panel.getByRole('tab', { name: 'Answers' }).click()
    await expect(panel.getByText('555-010-1234')).toBeVisible()
    await panel.getByRole('tab', { name: 'Page' }).click()
    const list = panel.getByRole('region', { name: 'Detected fields' })
    await expect(list.locator('li', { hasText: 'Phone' })).toContainText('555', { timeout: 15_000 })
  })
})
