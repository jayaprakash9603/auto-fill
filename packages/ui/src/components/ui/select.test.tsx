import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AutofillRoot } from '../autofill-root'
import { Label } from './form-controls'
import { SimpleSelect, type SimpleSelectGroup, type SimpleSelectOption } from './select'

function Harness({
  initial,
  options,
  groups,
  placeholder,
  onChange,
}: {
  initial: string
  options?: SimpleSelectOption[]
  groups?: SimpleSelectGroup[]
  placeholder?: string
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <AutofillRoot>
      <Label htmlFor="pick">Category</Label>
      <SimpleSelect
        id="pick"
        value={value}
        placeholder={placeholder}
        options={options}
        groups={groups}
        onValueChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
      />
    </AutofillRoot>
  )
}

describe('SimpleSelect', () => {
  it('opens a Radix listbox inside the scoped portal instead of a native select', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial="work"
        options={[
          { value: 'work', label: 'Work' },
          { value: 'home', label: 'Home' },
        ]}
      />,
    )

    const trigger = screen.getByRole('combobox', { name: 'Category' })
    expect(trigger.tagName).toBe('BUTTON')
    expect(document.querySelector('select:not([aria-hidden])')).toBeNull()
    expect(trigger).toHaveTextContent('Work')

    await user.click(trigger)
    const listbox = await screen.findByRole('listbox')
    expect(listbox.closest('.ufa-root')).not.toBeNull()
    await user.click(screen.getByRole('option', { name: 'Home' }))

    expect(trigger).toHaveTextContent('Home')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('lets an option use an empty value for "none" or "all"', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Harness
        initial=""
        onChange={onChange}
        options={[
          { value: '', label: 'All categories' },
          { value: 'personal', label: 'Personal' },
        ]}
      />,
    )

    const trigger = screen.getByRole('combobox', { name: 'Category' })
    expect(trigger).toHaveTextContent('All categories')

    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'Personal' }))
    expect(onChange).toHaveBeenLastCalledWith('personal')

    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'All categories' }))
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(trigger).toHaveTextContent('All categories')
  })

  it('shows the placeholder until a value is chosen and labels option groups', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial=""
        placeholder="Choose an answer"
        groups={[
          { label: 'Custom fields', options: [] },
          { label: 'Identity', options: [{ value: 'firstName', label: 'First name' }] },
        ]}
      />,
    )

    const trigger = screen.getByRole('combobox', { name: 'Category' })
    expect(trigger).toHaveTextContent('Choose an answer')

    await user.click(trigger)
    const group = await screen.findByRole('group')
    expect(group).toHaveTextContent('Identity')
    expect(screen.queryByText('Custom fields')).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'First name' }))
    expect(trigger).toHaveTextContent('First name')
  })
})
