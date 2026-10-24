import { addAnswer } from './support/data'
import { expect, test } from './support/fixtures'

test.describe('fill', () => {
  test('fills only selected fields, preserves non-empty values, and undo restores', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))
    await page.fill('#last-name', 'Keep me')

    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    await addAnswer(panel, 'First name', 'Ada')
    await addAnswer(panel, 'Email address', 'ada@example.com')
    await addAnswer(panel, 'Country', 'india')
    await panel.getByRole('tab', { name: 'Page' }).click()

    const list = panel.getByRole('region', { name: 'Detected fields' })
    await expect(list).toContainText('First name')

    const terms = list.locator('li', { hasText: 'I agree to the terms' })
    await expect(terms.getByRole('checkbox')).not.toBeChecked()

    await panel.getByRole('button', { name: /Fill selected/i }).click()
    await expect(page.locator('#first-name')).toHaveValue('Ada')
    await expect(page.locator('#last-name')).toHaveValue('Keep me')
    await expect(page.locator('#email')).toHaveValue('ada@example.com')
    await expect(page.locator('#country')).toHaveValue('IN')
    await expect(page.locator('input[name="terms"]')).not.toBeChecked()

    await panel.getByRole('button', { name: 'Undo fill' }).click()
    await expect(panel.locator('[data-slot="fill-status"]')).toContainText('Restored')
    await expect(page.locator('#first-name')).toHaveValue('')
    await expect(page.locator('#email')).toHaveValue('')
    await expect(page.locator('#country')).toHaveValue('')
    await expect(page.locator('#last-name')).toHaveValue('Keep me')
  })

  test('fills an embedded frame field when selected', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))

    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    await addAnswer(panel, 'LinkedIn profile', 'https://example.com/in/ada')
    await panel.getByRole('tab', { name: 'Page' }).click()

    const list = panel.getByRole('region', { name: 'Detected fields' })
    const frameField = list.locator('li', { hasText: 'LinkedIn profile' })
    await frameField.getByRole('checkbox').check()
    await panel.getByRole('button', { name: /Fill selected/i }).click()

    const frame = page.frameLocator('iframe[title="Embedded questions"]')
    await expect(frame.locator('#linkedin')).toHaveValue('https://example.com/in/ada')
  })
})
