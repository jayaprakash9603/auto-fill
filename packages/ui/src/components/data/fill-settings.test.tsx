import { createAutofillStore, createMemoryStorage } from '@ufa/storage'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AutofillRoot } from '../autofill-root'
import { FillSettings } from './fill-settings'

async function setup() {
  const store = createAutofillStore({ adapter: createMemoryStorage() })
  await store.ready()
  render(
    <AutofillRoot>
      <FillSettings store={store} />
    </AutofillRoot>,
  )
  return store
}

describe('FillSettings', () => {
  it('switches the fill mode with the radio group', async () => {
    const user = userEvent.setup()
    const store = await setup()

    const modes = screen.getByRole('radiogroup', { name: 'How autofill works' })
    expect(modes).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Review' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Trusted' }))

    await waitFor(() => expect(store.getSnapshot().settings.mode).toBe('trusted'))
    expect(screen.getByRole('radio', { name: 'Trusted' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Review' })).not.toBeChecked()
  })

  it('changes the trusted minimum confidence with the select', async () => {
    const user = userEvent.setup()
    const store = await setup()

    const confidence = screen.getByRole('combobox', {
      name: 'Minimum confidence for trusted filling',
    })
    expect(confidence).toHaveTextContent('90%')

    await user.click(confidence)
    await user.click(await screen.findByRole('option', { name: '98%' }))

    await waitFor(() => expect(store.getSnapshot().settings.trusted.minConfidence).toBe(0.98))
    expect(confidence).toHaveTextContent('98%')
  })
})
