import { createAutofillStore, createMemoryStorage, serializeExport } from '@ufa/storage'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AutofillRoot } from '../autofill-root'
import { AnswerLibrary } from './answer-library'
import { DataManager } from './data-manager'
import { ProfileManager } from './profile-manager'
import { ProfileSelector } from './profile-selector'

const setupUser = () => userEvent.setup({ delay: null })

/** One input event instead of one per character, which keeps these flows fast under load. */
async function enter(user: ReturnType<typeof setupUser>, element: HTMLElement, value: string) {
  await user.click(element)
  await user.paste(value)
}

async function setup() {
  const storage = createMemoryStorage()
  const store = createAutofillStore({ adapter: storage })
  await store.ready()
  return { storage, store }
}

const inRoot = (node: ReactNode) => render(<AutofillRoot>{node}</AutofillRoot>)

const text = (value: string) => ({ kind: 'text' as const, text: value })

describe('ProfileSelector', () => {
  it('switches the active profile and keeps the choice after a reload', async () => {
    const user = setupUser()
    const { storage, store } = await setup()
    const backend = await store.profiles.create({
      name: 'Backend roles',
      templateId: 'software-developer',
    })
    inRoot(<ProfileSelector store={store} />)

    const select = screen.getByRole('combobox', { name: 'Profile' })
    expect(select).toHaveDisplayValue(/General/)
    await user.selectOptions(select, backend.id)

    await waitFor(() => expect(store.getSnapshot().activeProfile?.id).toBe(backend.id))
    expect(select).toHaveDisplayValue('Backend roles')

    const reopened = createAutofillStore({ adapter: storage })
    await reopened.ready()
    expect(reopened.getSnapshot().activeProfile?.name).toBe('Backend roles')
  })
})

describe('ProfileManager', () => {
  it('creates a profile from a blank template and makes it active', async () => {
    const user = setupUser()
    const { store } = await setup()
    inRoot(<ProfileManager store={store} />)

    await user.click(screen.getByRole('button', { name: 'New profile' }))
    const dialog = await screen.findByRole('dialog', { name: 'New profile' })
    await enter(user, within(dialog).getByLabelText('Name'), 'QA roles')
    await user.selectOptions(within(dialog).getByLabelText('Start from'), 'software-testing')
    await user.click(within(dialog).getByRole('button', { name: 'Create profile' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const created = store.getSnapshot().profiles.find((profile) => profile.name === 'QA roles')
    expect(created).toMatchObject({ templateId: 'software-testing', isDefault: false })
    expect(store.getSnapshot().answers).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Use QA roles for filling' }))
    await waitFor(() => expect(store.getSnapshot().activeProfile?.name).toBe('QA roles'))
    const row = screen.getByText('QA roles').closest('li')
    expect(within(row!).getByText('Active')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Use QA roles for filling' }),
    ).not.toBeInTheDocument()
  })

  it('rejects a second profile with the same name', async () => {
    const user = setupUser()
    const { store } = await setup()
    inRoot(<ProfileManager store={store} />)

    await user.click(screen.getByRole('button', { name: 'New profile' }))
    const dialog = await screen.findByRole('dialog')
    await enter(user, within(dialog).getByLabelText('Name'), 'general')
    await user.click(within(dialog).getByRole('button', { name: 'Create profile' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already exists')
    expect(store.getSnapshot().profiles).toHaveLength(1)
  })

  it('deletes a profile and its own answers after confirmation', async () => {
    const user = setupUser()
    const { store } = await setup()
    const temp = await store.profiles.create({ name: 'Temp', templateId: 'custom' })
    await store.answers.create({
      label: 'Notice period',
      value: text('Two weeks'),
      profileId: temp.id,
    })
    await store.answers.create({ label: 'Pronouns', value: text('they/them') })
    inRoot(<ProfileManager store={store} />)

    screen.getByRole('button', { name: 'More actions for Temp' }).focus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Temp?' })
    expect(confirm).toHaveTextContent('Its 1 own answers are deleted')
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(store.getSnapshot().profiles.map((profile) => profile.name)).toEqual(['General']),
    )
    expect(store.getSnapshot().answers.map((answer) => answer.label)).toEqual(['Pronouns'])
  })

  it('saves shared details for every profile and role details for this one', async () => {
    const user = setupUser()
    const { store } = await setup()
    const general = store.getSnapshot().profiles[0]!
    inRoot(<ProfileManager store={store} />)

    await user.click(screen.getByRole('button', { name: 'Edit details of General' }))
    let dialog = await screen.findByRole('dialog', { name: 'Details: General' })
    await enter(user, within(dialog).getByLabelText('First name'), 'Alex')
    await enter(user, within(dialog).getByLabelText('Current designation'), 'Engineer')
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const answers = store.getSnapshot().answers
    expect(answers.find((answer) => answer.semanticKey === 'firstName')).toMatchObject({
      profileId: null,
      value: text('Alex'),
    })
    expect(answers.find((answer) => answer.semanticKey === 'currentTitle')).toMatchObject({
      profileId: general.id,
      value: text('Engineer'),
    })
    expect(answers).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Edit details of General' }))
    dialog = await screen.findByRole('dialog', { name: 'Details: General' })
    expect(within(dialog).getByLabelText('First name')).toHaveValue('Alex')
    await user.clear(within(dialog).getByLabelText('First name'))
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(store.getSnapshot().answers.map((answer) => answer.semanticKey)).toEqual([
      'currentTitle',
    ])
  })
})

describe('AnswerLibrary', () => {
  it('adds, edits, finds and deletes an answer', async () => {
    const user = setupUser()
    const { store } = await setup()
    await store.answers.create({ label: 'Pronouns', value: text('they/them') })
    inRoot(<AnswerLibrary store={store} />)

    await user.click(screen.getByRole('button', { name: 'Add answer' }))
    let dialog = await screen.findByRole('dialog', { name: 'Add answer' })
    await enter(user, within(dialog).getByLabelText('Question or label'), 'Notice period')
    await enter(user, within(dialog).getByLabelText('Answer'), 'Two weeks')
    await user.click(within(dialog).getByRole('button', { name: 'Save answer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const list = screen.getByRole('list')
    expect(within(list).getByText('Notice period')).toBeInTheDocument()
    expect(within(list).getByText('Two weeks')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Notice period' }))
    dialog = await screen.findByRole('dialog', { name: 'Edit answer' })
    const value = within(dialog).getByLabelText('Answer')
    await user.clear(value)
    await enter(user, value, 'One month')
    await user.click(within(dialog).getByRole('button', { name: 'Save answer' }))
    await waitFor(() => expect(within(list).getByText('One month')).toBeInTheDocument())

    await enter(user, screen.getByRole('searchbox', { name: 'Search answers' }), 'notice')
    expect(within(list).queryByText('Pronouns')).not.toBeInTheDocument()
    expect(within(list).getByText('Notice period')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete Notice period' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete this answer?' })
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(store.getSnapshot().answers.map((answer) => answer.label)).toEqual(['Pronouns']),
    )
    expect(screen.getByText('No answers match your search')).toBeInTheDocument()
  })

  it('refuses to save an answer for a secret field', async () => {
    const user = setupUser()
    const { store } = await setup()
    inRoot(<AnswerLibrary store={store} />)

    await user.click(screen.getByRole('button', { name: 'Add answer' }))
    const dialog = await screen.findByRole('dialog')
    await enter(user, within(dialog).getByLabelText('Question or label'), 'Password')
    await enter(user, within(dialog).getByLabelText('Answer'), 'hunter2')
    await user.click(within(dialog).getByRole('button', { name: 'Save answer' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('never saved')
    expect(store.getSnapshot().answers).toEqual([])
  })
})

describe('DataManager', () => {
  it('imports an export from another browser after showing what will change', async () => {
    const user = setupUser()
    const source = await setup()
    await source.store.profiles.create({ name: 'Backend roles', templateId: 'software-developer' })
    await source.store.answers.create({ label: 'Notice period', value: text('Two weeks') })
    const file = new File([serializeExport(await source.store.transfer.export())], 'export.json', {
      type: 'application/json',
    })

    const { store } = await setup()
    inRoot(<DataManager store={store} />)
    await user.upload(screen.getByLabelText('Export file'), file)

    expect(await screen.findByText(/Adds 1 profiles, 1 answers and 0 fields/)).toBeInTheDocument()
    expect(store.getSnapshot().answers).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Import' }))

    expect(await screen.findByText('Imported: 1 new answers, 1 new profiles.')).toBeInTheDocument()
    expect(
      store
        .getSnapshot()
        .profiles.map((profile) => profile.name)
        .sort(),
    ).toEqual(['Backend roles', 'General'])
    expect(store.getSnapshot().answers.map((answer) => answer.label)).toEqual(['Notice period'])
  })

  it('explains why a file cannot be imported', async () => {
    const user = setupUser()
    const { store } = await setup()
    inRoot(<DataManager store={store} />)

    await user.upload(screen.getByLabelText('Export file'), new File(['{"hello":1}'], 'other.json'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This file cannot be imported')
    expect(alert).toHaveTextContent('not a Universal Form Autofill export')
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument()
  })

  it('downloads an export file', async () => {
    const user = setupUser()
    const { store } = await setup()
    await store.answers.create({ label: 'Notice period', value: text('Two weeks') })
    const blobs: Blob[] = []
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob)
        return 'blob:export'
      }),
      revokeObjectURL: vi.fn(),
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    inRoot(<DataManager store={store} />)

    await user.click(screen.getByRole('button', { name: 'Export data' }))

    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    const link = click.mock.contexts[0] as HTMLAnchorElement
    expect(link.download).toMatch(/^form-autofill-\d{4}-\d{2}-\d{2}\.json$/)
    const parsed = store.transfer.parse(await blobs[0]!.text())
    expect(parsed.ok && parsed.bundle.answers.map((answer) => answer.label)).toEqual([
      'Notice period',
    ])
  })

  it('deletes all data only after confirmation', async () => {
    const user = setupUser()
    const { store } = await setup()
    await store.answers.create({ label: 'Notice period', value: text('Two weeks') })
    inRoot(<DataManager store={store} />)

    await user.click(screen.getByRole('button', { name: 'Delete all data' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete all autofill data?' })
    expect(store.getSnapshot().answers).toHaveLength(1)
    await user.click(within(confirm).getByRole('button', { name: 'Delete all data' }))

    expect(await screen.findByText('All data was deleted.')).toBeInTheDocument()
    expect(store.getSnapshot().answers).toEqual([])
    expect(store.getSnapshot().profiles.map((profile) => profile.name)).toEqual(['General'])
  })
})
