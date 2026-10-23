import { expect, type Locator, type Page } from '@playwright/test'

/** Panel controls are looked up in `scope`; dialogs are portalled to the page body. */
export async function createProfile(
  page: Page,
  name: string,
  template: string,
  scope: Page | Locator = page,
) {
  await scope.getByRole('tab', { name: 'Profiles' }).click()
  await scope.getByRole('button', { name: 'New profile' }).click()
  const dialog = page.getByRole('dialog', { name: 'New profile' })
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Start from').selectOption({ label: template })
  await dialog.getByRole('button', { name: 'Create profile' }).click()
  await expect(dialog).toBeHidden()
}

export async function addAnswer(
  page: Page,
  label: string,
  value: string,
  scope: Page | Locator = page,
) {
  await scope.getByRole('tab', { name: 'Answers' }).click()
  await scope.getByRole('button', { name: 'Add answer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add answer' })
  await dialog.getByLabel('Question or label').fill(label)
  await dialog.getByLabel('Answer', { exact: true }).fill(value)
  await dialog.getByRole('button', { name: 'Save answer' }).click()
  await expect(dialog).toBeHidden()
}
