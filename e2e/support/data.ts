import { expect, type Locator, type Page } from '@playwright/test'

/** Opens a shadcn select and picks an option; the list is portalled into the page's `.ufa-root`. */
export async function chooseOption(page: Page, trigger: Locator, option: string) {
  await trigger.click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await expect(page.getByRole('listbox')).toBeHidden()
}

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
  await chooseOption(page, dialog.getByRole('combobox', { name: 'Start from' }), template)
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
