import '../shared/page.css'

import { AutofillPanel, Button } from '@ufa/ui'
import { ExternalLinkIcon } from 'lucide-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createHost } from '../shared/host'
import { AccessSettings, AppearanceSettings } from '../shared/settings-sections'
import { useSchemePreference } from '../shared/theme'

const host = createHost()

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
    <SidePanel />
  </StrictMode>,
)
