import type { ExtensionAutofillHost } from '@ufa/extension-bridge'
import {
  AutofillRoot,
  Button,
  ConnectionBadge,
  PermissionNotice,
  PortalStatus,
  RestrictedPageState,
  Spinner,
  useAutofillController,
  useAutofillState,
} from '@ufa/ui'
import { PanelRightOpenIcon, SettingsIcon, WandSparklesIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

export function Popup({ host }: { host: ExtensionAutofillHost }) {
  const controller = useAutofillController(host)
  const state = useAutofillState(controller)
  const [windowId, setWindowId] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  // Only trusted mode on a trusted site produces `fill` decisions.
  const trustedCount = Object.values(state.decisions).filter(
    (decision) => decision.action === 'fill',
  ).length

  const fillTrusted = async () => {
    if (!controller) return
    setStatus(null)
    try {
      const results = await controller.fill()
      const filled = results.filter((result) => result.status === 'filled').length
      const noun = results.length === 1 ? 'field' : 'fields'
      setStatus(
        `Filled ${filled} of ${results.length} trusted ${noun}. Review the form before you submit it.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void chrome.windows.getCurrent().then((win) => setWindowId(win.id ?? null))
  }, [])

  const openSidePanel = () => {
    if (windowId == null) return
    // No awaits before this call: sidePanel.open must run inside the click's user gesture.
    void chrome.sidePanel.open({ windowId }).then(() => window.close())
  }

  return (
    <AutofillRoot className="ufa:flex ufa:w-80 ufa:flex-col ufa:gap-3 ufa:p-3">
      <header className="ufa:flex ufa:items-center ufa:gap-2">
        <img src="/icons/icon-32.png" alt="" className="ufa:size-5" />
        <h1 className="ufa:flex-1 ufa:text-sm ufa:font-semibold">Universal Form Autofill</h1>
        <ConnectionBadge status={state.status} />
      </header>

      {state.status === 'connecting' && !state.page ? (
        <div className="ufa:flex ufa:items-center ufa:gap-2 ufa:text-xs ufa:text-muted-foreground">
          <Spinner /> Connecting to the page…
        </div>
      ) : state.page ? (
        <PortalStatus page={state.page} />
      ) : state.error?.code === 'RESTRICTED_PAGE' ? (
        <RestrictedPageState className="ufa:py-2" />
      ) : state.error?.code === 'PERMISSION_REQUIRED' ? (
        <PermissionNotice
          className="ufa:py-2"
          site={state.error.site}
          onRequest={host.requestPageAccess}
          onGranted={() => void controller?.connect()}
          onRetry={() => void controller?.connect()}
        />
      ) : state.error ? (
        <p className="ufa:text-xs ufa:text-muted-foreground">{state.error.message}</p>
      ) : null}

      {trustedCount > 0 ? (
        <Button
          variant="secondary"
          onClick={() => void fillTrusted()}
          disabled={state.filling}
          aria-busy={state.filling || undefined}
        >
          {state.filling ? <Spinner /> : <WandSparklesIcon />}
          Fill trusted fields ({trustedCount})
        </Button>
      ) : null}
      {status ? (
        <p role="status" className="ufa:text-xs ufa:text-muted-foreground">
          {status}
        </p>
      ) : null}

      <div className="ufa:flex ufa:gap-2">
        <Button className="ufa:flex-1" onClick={openSidePanel} disabled={windowId == null}>
          <PanelRightOpenIcon />
          Open side panel
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Settings"
          title="Settings"
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          <SettingsIcon />
        </Button>
      </div>
    </AutofillRoot>
  )
}
