import { createAutofill, type AutofillHost } from '@ufa/autofill-sdk'
import {
  AutofillError,
  type FieldDescriptor,
  type PageDriver,
  type PageEvent,
  type PageInfo,
} from '@ufa/core'
import { createMemoryStorage } from '@ufa/storage'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AutofillPanel } from './autofill-panel'
import { AutofillRoot } from './autofill-root'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

const PAGE: PageInfo = {
  url: 'https://jobs.example.com/apply',
  title: 'Apply for Engineer',
  hostname: 'jobs.example.com',
  frameCount: 2,
  adapterId: 'generic',
  adapterName: 'Generic',
  runtimeVersion: '0.1.0',
}

function field(overrides: Partial<FieldDescriptor> & Pick<FieldDescriptor, 'id' | 'label'>) {
  const base: FieldDescriptor = {
    id: overrides.id,
    fingerprint: `fp-${overrides.id}`,
    frameId: 0,
    order: 0,
    type: 'text',
    label: overrides.label,
    normalizedLabel: overrides.label.toLowerCase(),
    labelSource: 'label-for',
    semanticKey: null,
    semanticConfidence: 0,
    placeholder: null,
    name: null,
    htmlId: null,
    autocomplete: null,
    inputMode: null,
    maxLength: null,
    aria: {
      role: null,
      label: null,
      description: null,
      required: false,
      invalid: false,
      expanded: null,
      controls: null,
    },
    section: 'Personal information',
    formTitle: 'Engineer application',
    required: false,
    visible: true,
    editable: true,
    hasValue: false,
    currentValue: null,
    options: [],
    multiple: false,
    sensitivity: 'normal',
    sensitivityReason: null,
    support: 'supported',
    unsupportedReason: null,
    detectorId: 'ufa.native-controls',
    detectionConfidence: 1,
    portalAdapterId: null,
    inShadowRoot: false,
  }
  return { ...base, ...overrides }
}

const FIELDS: FieldDescriptor[] = [
  field({ id: 'a', label: 'First name', order: 0, required: true }),
  field({ id: 'b', label: 'Email', order: 1, type: 'email', hasValue: true }),
  field({
    id: 'c',
    label: 'Create a password',
    order: 2,
    type: 'password',
    section: 'Account',
    sensitivity: 'prohibited',
    sensitivityReason: 'password',
  }),
  field({
    id: 'd',
    label: 'I agree to the terms',
    order: 3,
    type: 'checkbox',
    section: null,
    sensitivity: 'consent',
  }),
  field({
    id: 'e',
    label: 'Salary expectation',
    order: 4,
    type: 'range',
    section: null,
    labelSource: 'adjacent-text',
    support: 'unsupported',
    unsupportedReason: 'Sliders are not supported yet.',
  }),
  field({ id: 'f', label: 'LinkedIn profile', frameId: 1, type: 'url', section: null }),
]

function fakeDriver(connect: () => Promise<PageInfo>, fields: FieldDescriptor[] = FIELDS) {
  const listeners = new Set<(event: PageEvent) => void>()
  const driver: PageDriver & { emit(event: PageEvent): void; disposed: number } = {
    kind: 'test',
    disposed: 0,
    connect: vi.fn(connect),
    scan: vi.fn(async () => ({ page: PAGE, fields, scannedAt: 1 })),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async dispose() {
      driver.disposed += 1
    },
    emit(event) {
      for (const listener of listeners) listener(event)
    },
  }
  return driver
}

function hostFor(
  driver: PageDriver,
  requestPageAccess?: () => Promise<boolean>,
): AutofillHost & { created: number } {
  const host = {
    created: 0,
    createController() {
      host.created += 1
      return createAutofill({ driver, storage: createMemoryStorage() })
    },
    requestPageAccess,
  }
  return host
}

describe('AutofillPanel', () => {
  it('connects on mount and shows the page status', async () => {
    const driver = fakeDriver(async () => PAGE)
    render(<AutofillPanel host={hostFor(driver)} />)
    expect(await screen.findByText('Apply for Engineer')).toBeInTheDocument()
    expect(screen.getByText('jobs.example.com')).toBeInTheDocument()
    expect(screen.getByText('2 frames')).toBeInTheDocument()
    expect(screen.getByText('Portal: Generic')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('destroys the controller it created on unmount, also under StrictMode', async () => {
    const driver = fakeDriver(async () => PAGE)
    const host = hostFor(driver)
    const { unmount } = render(
      <StrictMode>
        <AutofillPanel host={host} />
      </StrictMode>,
    )
    await screen.findByText('Apply for Engineer')
    unmount()
    await waitFor(() => expect(driver.disposed).toBe(host.created))
  })

  it('asks for site access from a click and reconnects once granted', async () => {
    let allowed = false
    const driver = fakeDriver(async () => {
      if (!allowed)
        throw new AutofillError('PERMISSION_REQUIRED', 'Needs access', {
          details: { site: 'jobs.example.com' },
        })
      return PAGE
    })
    const requestPageAccess = vi.fn(async () => {
      allowed = true
      return true
    })
    render(<AutofillPanel host={hostFor(driver, requestPageAccess)} />)
    expect(await screen.findByText('Allow access to this site')).toBeInTheDocument()
    expect(screen.getByText(/read the form on jobs\.example\.com/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Allow access' }))
    expect(requestPageAccess).toHaveBeenCalledOnce()
    expect(await screen.findByText('Apply for Engineer')).toBeInTheDocument()
  })

  it('explains one-time access when the browser hides the site', async () => {
    const driver = fakeDriver(async () => {
      throw new AutofillError('PERMISSION_REQUIRED', 'Needs access', { details: { site: null } })
    })
    render(<AutofillPanel host={hostFor(driver, async () => true)} />)
    expect(await screen.findByText(/grant access for this visit/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Allow access' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(driver.connect).toHaveBeenCalledTimes(2))
  })

  it('explains restricted pages and generic errors with retry', async () => {
    const restricted = fakeDriver(async () => {
      throw new AutofillError('RESTRICTED_PAGE', 'nope')
    })
    const { unmount } = render(<AutofillPanel host={hostFor(restricted)} />)
    expect(await screen.findByText("This page can't be autofilled")).toBeInTheDocument()
    unmount()

    let attempts = 0
    const flaky = fakeDriver(async () => {
      attempts += 1
      if (attempts === 1)
        throw new AutofillError('INJECTION_FAILED', 'Could not start the page runtime.')
      return PAGE
    })
    render(<AutofillPanel host={hostFor(flaky)} />)
    expect(await screen.findByText('Could not start the page runtime.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Apply for Engineer')).toBeInTheDocument()
  })

  it('reconnects when the page navigates', async () => {
    const driver = fakeDriver(async () => PAGE)
    render(<AutofillPanel host={hostFor(driver)} />)
    await screen.findByText('Apply for Engineer')
    act(() => driver.emit({ type: 'navigated', url: 'https://jobs.example.com/next' }))
    await waitFor(() => expect(driver.connect).toHaveBeenCalledTimes(2))
  })

  it('applies message overrides', async () => {
    const driver = fakeDriver(async () => PAGE)
    render(<AutofillPanel host={hostFor(driver)} messages={{ 'panel.title': 'Autorrelleno' }} />)
    expect(await screen.findByText('Autorrelleno')).toBeInTheDocument()
  })

  it('lists detected fields by section with safety and support badges', async () => {
    const driver = fakeDriver(async () => PAGE)
    render(<AutofillPanel host={hostFor(driver)} />)
    const list = await screen.findByRole('region', { name: 'Detected fields' })
    expect(within(list).getByText('6 fields')).toBeInTheDocument()

    const personal = within(list).getByRole('group', { name: 'Personal information' })
    expect(within(personal).getByText('First name')).toBeInTheDocument()
    expect(within(personal).getByText('(required)', { exact: false })).toBeInTheDocument()
    expect(within(personal).getByText('Has value')).toBeInTheDocument()

    const account = within(list).getByRole('group', { name: 'Account' })
    expect(within(account).getByText('Protected')).toHaveAttribute(
      'title',
      'Never read or filled: password',
    )

    const form = within(list).getAllByRole('group', { name: 'Engineer application' })
    expect(form).toHaveLength(2)
    expect(within(form[0]!).getByText('Needs your OK')).toBeInTheDocument()
    expect(within(form[0]!).getByText('Unsupported')).toBeInTheDocument()
    expect(within(form[0]!).getByText('Sliders are not supported yet.')).toBeInTheDocument()
    expect(within(form[0]!).getByText('Slider · label from nearby text')).toBeInTheDocument()
    expect(within(form[1]!).getByText('Embedded frame')).toBeInTheDocument()
    expect(within(form[1]!).getByText('LinkedIn profile')).toBeInTheDocument()
  })

  it('updates the list when the page reports new fields for a frame', async () => {
    const driver = fakeDriver(async () => PAGE, [])
    render(<AutofillPanel host={hostFor(driver)} />)
    expect(await screen.findByText('No form fields found')).toBeInTheDocument()
    act(() =>
      driver.emit({
        type: 'fields-changed',
        frameId: 0,
        fields: [field({ id: 'n', label: 'Portfolio URL', type: 'url', section: 'Step 2' })],
      }),
    )
    expect(await screen.findByText('Portfolio URL')).toBeInTheDocument()
    expect(screen.getByText('1 field')).toBeInTheDocument()
  })

  it('keeps the heading for assistive technology only when embedded', async () => {
    const driver = fakeDriver(async () => PAGE)
    render(<AutofillPanel host={hostFor(driver)} embedded />)
    const heading = await screen.findByRole('heading', { name: 'Form Autofill', level: 2 })
    expect(heading).toHaveClass('ufa:sr-only')
  })
})

describe('AutofillRoot', () => {
  it('scopes tokens to its subtree and renders overlays into a themed body-level container', async () => {
    const { container, unmount } = render(
      <AutofillRoot theme={{ colorScheme: 'dark', tokens: { primary: '#123456' } }}>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Confirm</DialogTitle>
          </DialogContent>
        </Dialog>
      </AutofillRoot>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('ufa-root')
    expect(root.dataset.ufaScheme).toBe('dark')
    expect(root.style.getPropertyValue('--ufa-primary')).toBe('#123456')
    expect(document.documentElement.style.getPropertyValue('--ufa-primary')).toBe('')

    const title = await screen.findByText('Confirm')
    const portal = title.closest('[data-ufa-portal]') as HTMLElement
    expect(portal).not.toBeNull()
    expect(portal.parentElement).toBe(document.body)
    expect(portal).toHaveClass('ufa-root')
    expect(portal.dataset.ufaScheme).toBe('dark')
    expect(portal.style.getPropertyValue('--ufa-primary')).toBe('#123456')

    unmount()
    expect(document.querySelector('[data-ufa-portal]')).toBeNull()
  })
})
