import { readFile } from 'node:fs/promises'

import { addAnswer, chooseOption, createProfile } from './support/data'
import { expect, test } from './support/fixtures'

test.describe('profiles and saved answers', () => {
  test('persist across reloads of the side panel, including the active profile', async ({
    openExtensionPage,
    serviceWorker,
  }) => {
    const panel = await openExtensionPage('src/sidepanel/index.html')
    const selector = panel.getByRole('combobox', { name: 'Profile' })
    await expect(selector).toHaveText(/General/)

    await createProfile(panel, 'Backend roles', 'Software developer')
    await panel.getByRole('button', { name: 'Use Backend roles for filling' }).click()
    await expect(selector).toHaveText('Backend roles')
    await addAnswer(panel, 'Notice period', 'Two weeks')

    await panel.reload()
    await expect(selector).toHaveText('Backend roles')
    await panel.getByRole('tab', { name: 'Answers' }).click()
    await expect(panel.getByText('Notice period')).toBeVisible()
    await expect(panel.getByText('Two weeks')).toBeVisible()

    const stored = await serviceWorker.evaluate(() => chrome.storage.local.get(null))
    expect(Object.keys(stored).sort()).toEqual([
      'ufa:answers',
      'ufa:customFields',
      'ufa:mappings',
      'ufa:meta',
      'ufa:profiles',
      'ufa:settings',
    ])
    expect(JSON.stringify(stored)).not.toContain('password')
  })

  test('switching profiles in one extension page updates the others', async ({
    openExtensionPage,
  }) => {
    const options = await openExtensionPage('src/options/index.html')
    const panel = await openExtensionPage('src/sidepanel/index.html')
    const panelSelector = panel.getByRole('combobox', { name: 'Profile' })
    const optionsSelector = options.getByRole('combobox', { name: 'Profile' })
    await expect(panelSelector).toHaveText(/General/)

    await createProfile(options, 'QA roles', 'Software testing')
    await chooseOption(options, optionsSelector, 'QA roles')
    await expect(panelSelector).toHaveText('QA roles')

    await addAnswer(panel, 'Preferred test framework', 'Playwright')
    await options.getByRole('tab', { name: 'Answers' }).click()
    await expect(options.getByText('Preferred test framework')).toBeVisible()

    await chooseOption(panel, panelSelector, 'General (Default)')
    await expect(optionsSelector).toHaveText('General (Default)')
  })

  test('profile details save shared and role-specific answers', async ({ openExtensionPage }) => {
    const options = await openExtensionPage('src/options/index.html#profiles')
    await options.getByRole('button', { name: 'Edit details of General' }).click()
    const dialog = options.getByRole('dialog', { name: 'Details: General' })
    await dialog.getByLabel('First name').fill('Alex')
    await dialog.getByLabel('Current designation').fill('Engineer')
    await dialog.getByRole('button', { name: 'Save details' }).click()
    await expect(dialog).toBeHidden()

    await options.getByRole('tab', { name: 'Answers' }).click()
    const answers = options.locator('[data-answer-id]')
    await expect(answers).toHaveCount(2)
    await expect(answers.getByText('Alex')).toBeVisible()
    await expect(answers.getByText('Engineer')).toBeVisible()
  })

  test('export, delete everything, and import the file back', async ({ openExtensionPage }) => {
    const options = await openExtensionPage('src/options/index.html')
    await addAnswer(options, 'Notice period', 'Two weeks')
    await createProfile(options, 'Backend roles', 'Software developer')

    await options.getByRole('tab', { name: 'Data' }).click()
    const downloading = options.waitForEvent('download')
    await options.getByRole('button', { name: 'Export data' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^form-autofill-\d{4}-\d{2}-\d{2}\.json$/)
    const file = await download.path()
    const exported = JSON.parse(await readFile(file, 'utf8')) as { format: string }
    expect(exported.format).toBe('universal-form-autofill/export')

    await options.getByRole('button', { name: 'Delete all data' }).click()
    const confirm = options.getByRole('alertdialog', { name: 'Delete all autofill data?' })
    await confirm.getByRole('button', { name: 'Delete all data' }).click()
    await expect(options.getByText('All data was deleted.')).toBeVisible()

    await options.getByLabel('Export file').setInputFiles(file)
    await expect(options.getByText(/Adds 1 profiles, 1 answers and 0 fields/)).toBeVisible()
    await options.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(options.getByText('Imported: 1 new answers, 1 new profiles.')).toBeVisible()

    await options.getByRole('tab', { name: 'Answers' }).click()
    await expect(options.getByText('Notice period')).toBeVisible()
    await options.getByRole('combobox', { name: 'Profile' }).click()
    await expect(options.getByRole('option')).toHaveText(['General (Default)', 'Backend roles'])
    await options.keyboard.press('Escape')
    await expect(options.getByRole('listbox')).toBeHidden()
  })
})
