import '../shared/page.css'

import { AutofillPanel, Button } from '@ufa/ui'
import { ExternalLinkIcon } from 'lucide-react'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import { createHost } from '../shared/host'
import { AccessSettings, AppearanceSettings } from '../shared/settings-sections'
import { useSchemePreference } from '../shared/theme'

const host = createHost()

class PanelErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : 'Form Autofill could not start.' }
  }

  render() {
    if (this.state.message) {
      return (
        <p role="alert" style={{ margin: 16, font: '14px/1.4 system-ui, sans-serif' }}>
          {this.state.message}
        </p>
      )
    }
    return this.props.children
  }
}

function SidePanel() {
  const { preference, update, theme } = useSchemePreference()
  return (
    <AutofillPanel
      host={host}
      embedded
      theme={theme}
      className="ufa:h-full"
      settingsTab={
        <>
          <AppearanceSettings preference={preference} onChange={update} />
          <AccessSettings />
          <Button
            variant="outline"
            size="sm"
            className="ufa:self-start"
            onClick={() => void chrome.runtime.openOptionsPage()}
          >
            <ExternalLinkIcon /> Open full settings page
          </Button>
        </>
      }
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PanelErrorBoundary>
      <SidePanel />
    </PanelErrorBoundary>
  </StrictMode>,
)
