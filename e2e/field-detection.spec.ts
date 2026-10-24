import type { Page } from '@playwright/test'

import { expect, test } from './support/fixtures'

const readFormState = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')].map((field) =>
      field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value,
    ),
  )

test.describe('field detection', () => {
  test('lists the fields of the page and its same-origin frame without touching them', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('simple-application.html'))
    await expect(page.frameLocator('iframe').locator('#linkedin')).toBeVisible()
    const before = await readFormState(page)

    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    const list = panel.getByRole('region', { name: 'Detected fields' })
    await expect(list.getByText('8 fields')).toBeVisible()

    const personal = list.getByRole('group', { name: 'Personal information' })
    await expect(personal.locator('li')).toHaveCount(4)
    await expect(personal.locator('li').first()).toContainText('First name')
    await expect(personal.locator('li').first()).toContainText('(required)')

    const sponsorship = list.getByRole('group', { name: 'Work authorization' })
    await expect(sponsorship).toContainText('Will you now or in the future require sponsorship?')
    await expect(sponsorship).toContainText('Single choice · 2 options')

    const terms = list.locator('li', { hasText: 'I agree to the terms and conditions' })
    await expect(terms.getByText('Needs your OK')).toBeVisible()

    const frame = list.getByRole('group').filter({ hasText: 'Embedded frame' })
    await expect(frame).toContainText('LinkedIn profile')

    expect(await readFormState(page)).toEqual(before)
  })

  test('follows a multi-step form as steps are revealed and inserted', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('multi-step.html'))
    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    const list = panel.getByRole('region', { name: 'Detected fields' })
    // By the label's title: rows also say what the field was recognized as ("Recognized as Full name").
    const label = (text: string) => list.locator(`li label[title="${text}"]`)
    await expect(label('Full name')).toBeVisible()
    await expect(label('Referrer name')).toHaveCount(0)

    await page.locator('#has-referral').check()
    await expect(label('Referrer name')).toBeVisible()

    await page.locator('#to-step-2').click()
    await expect(label('Years of experience')).toBeVisible()
    await expect(label('Full name')).toHaveCount(0)

    await page.locator('#to-step-3').click()
    await expect(label('Why do you want to join?')).toBeVisible()
    await expect(list.getByText('1 field')).toBeVisible()
  })

  test('detects ARIA widgets and controls inside open shadow roots', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('aria-widgets.html'))
    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    const list = panel.getByRole('region', { name: 'Detected fields' })
    await expect(list.getByText('10 fields')).toBeVisible()
    await expect(list.locator('li', { hasText: 'Years of experience' })).toContainText(
      'Combo box · 3 options',
    )
    await expect(list.locator('li', { hasText: 'Salary expectation' })).toContainText('Unsupported')
    await expect(list.locator('li', { hasText: 'Subscribe to job alerts' })).toContainText(
      'Needs your OK',
    )

    await page.goto(forms.url('shadow-dom.html'))
    await expect(list.getByText('6 fields')).toBeVisible()
    await expect(list.getByRole('group', { name: 'Address' })).toContainText('Postal code')
    await expect(list.getByText('Are you at least 18 years old?')).toBeVisible()
    await expect(list.getByText('Closed component')).toHaveCount(0)
  })

  test('protects sensitive fields and ignores honeypots with real layout', async ({
    context,
    forms,
    openExtensionPage,
  }) => {
    const page = await context.newPage()
    await page.goto(forms.url('heuristic-labels.html'))
    const panel = await openExtensionPage('src/sidepanel/index.html', page)
    const list = panel.getByRole('region', { name: 'Detected fields' })
    await expect(list.locator('li', { hasText: 'Create a password' })).toContainText('Protected')
    await expect(list.locator('li', { hasText: 'Verification code' })).toContainText('Protected')
    await expect(list.locator('li', { hasText: 'Current salary' })).toContainText(
      'label from nearby text',
    )
    await expect(list.getByText('Leave this empty')).toHaveCount(0)
    await expect(list.getByText('Referral code')).toHaveCount(0)
    expect(await page.locator('#password').inputValue()).toBe('not-a-real-secret')
  })
})
