import type { Page } from '@playwright/test'

import { addAnswer } from './support/data'
import { expect, test } from './support/fixtures'

const readFormState = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')].map((field) =>
      field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value,
    ),
  )

test.describe('matching', () => {
  test('proposes saved answers for text, select and radio fields without changing the page', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))
    const before = await readFormState(page)

    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    await addAnswer(panel, 'First name', 'Ada')
    await addAnswer(panel, 'Country', 'india')
    await addAnswer(panel, 'Will you now or in the future require sponsorship?', 'No')
    await panel.getByRole('tab', { name: 'Page' }).click()

    const list = panel.getByRole('region', { name: 'Detected fields' })
    const row = (label: string) => list.locator('li', { hasText: label }).first()

    await expect(row('First name')).toHaveAttribute('data-match-state', 'matched')
    await expect(row('First name')).toContainText('Recognized as First name')
    await expect(row('First name').locator('[data-slot="match-proposal"]')).toContainText(
      'Ada· high confidence',
    )

    await expect(row('Country')).toHaveAttribute('data-match-state', 'matched')
    await expect(row('Country').locator('[data-slot="match-proposal"]')).toContainText('India')

    const sponsorship = row('require sponsorship')
    await expect(sponsorship).toHaveAttribute('data-match-state', 'matched')
    await expect(sponsorship.locator('[data-slot="match-proposal"]')).toContainText('No')

    await expect(row('Phone')).toHaveAttribute('data-match-state', 'missing')
    await expect(row('Phone')).toContainText('No answer')
    await expect(row('I agree to the terms')).toContainText('Needs your OK')
    await expect(list.locator('[data-slot="match-summary"]')).toContainText('3 ready')

    expect(await readFormState(page)).toEqual(before)
  })
})
