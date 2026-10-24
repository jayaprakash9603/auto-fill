import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AutofillRoot } from './autofill-root'

const SHADOW_STYLES = `
  .ufa-root { --ufa-background: rgb(10, 20, 30); --ufa-foreground: rgb(240, 240, 240); background: var(--ufa-background); color: var(--ufa-foreground); }
  .ufa-root .ufa-panel-marker { font-size: 24px; }
`

describe('AutofillRoot', () => {
  it('applies theme tokens on the root element only', () => {
    const { container } = render(
      <AutofillRoot theme={{ tokens: { primary: 'rgb(0, 128, 0)' } }}>
        <p>Inside</p>
      </AutofillRoot>,
    )
    const root = container.querySelector<HTMLElement>('.ufa-root')
    expect(root?.style.getPropertyValue('--ufa-primary')).toBe('rgb(0, 128, 0)')
    expect(document.body.style.getPropertyValue('--ufa-primary')).toBe('')
  })

  it('does not set ufa token variables on the host body', () => {
    render(
      <AutofillRoot theme={{ tokens: { primary: 'rgb(1, 2, 3)' } }}>
        <span>Inside</span>
      </AutofillRoot>,
    )
    expect(document.body.style.getPropertyValue('--ufa-primary')).toBe('')
  })

  it('renders children inside a shadow root when shadowDom is enabled', () => {
    const { container } = render(
      <AutofillRoot shadowDom shadowStyles={SHADOW_STYLES}>
        <button type="button">Shadow button</button>
      </AutofillRoot>,
    )
    const host = container.querySelector('[data-ufa-shadow-host]')
    expect(host?.shadowRoot).toBeTruthy()
    expect(host?.shadowRoot?.querySelector('button')).toHaveTextContent('Shadow button')
    expect(document.querySelector('button')).toBeNull()
  })
})
