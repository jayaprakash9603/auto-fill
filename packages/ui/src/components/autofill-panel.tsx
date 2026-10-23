import type { AutofillController, AutofillHost, AutofillState } from '@ufa/autofill-sdk'
import { PlugZapIcon, RotateCwIcon, SearchXIcon } from 'lucide-react'
import { useCallback, type ReactNode } from 'react'

import { useAutofillController, useAutofillState } from '../hooks/use-autofill'
import { MessagesProvider, useTranslate, type AutofillMessages } from '../i18n/messages'
import { cn } from '../lib/cn'
import type { AutofillTheme } from '../theme/theme'
import { AutofillRoot } from './autofill-root'
import { FieldList } from './field-list'
import { ConnectionBadge, PortalStatus } from './portal-status'
import { EmptyState, ErrorState, PermissionNotice, RestrictedPageState } from './states'
import { Button } from './ui/button'
import { Spinner } from './ui/misc'

export interface AutofillPanelProps {
  /** Supplies controllers (and page access requests). Either `host` or `controller` is required. */
  host?: AutofillHost
  /** An existing controller; the panel connects it if idle but never destroys it. */
  controller?: AutofillController
  theme?: AutofillTheme
  messages?: AutofillMessages
  /** Removes the panel's own frame so it sits flush inside a host layout. */
  embedded?: boolean
  className?: string
}

export function AutofillPanel({
  host,
  controller,
  theme,
  messages,
  embedded = false,
  className,
}: AutofillPanelProps) {
  return (
    <AutofillRoot
      theme={theme}
      className={cn(
        'ufa:flex ufa:min-h-0 ufa:flex-col',
        !embedded && 'ufa:h-full ufa:rounded-lg ufa:border ufa:border-border',
        className,
      )}
    >
      <MessagesProvider messages={messages}>
        <PanelBody host={host} controller={controller} hideTitle={embedded} />
      </MessagesProvider>
    </AutofillRoot>
  )
}

function PanelBody({
  host,
  controller: external,
  hideTitle,
}: {
  host?: AutofillHost
  controller?: AutofillController
  /** The host page already shows a title; keep the heading for assistive technology only. */
  hideTitle: boolean
}) {
  const t = useTranslate()
  const controller = useAutofillController(host, external)
  const state = useAutofillState(controller)
  const reconnect = useCallback(() => void controller?.connect(), [controller])
  const busy = state.status === 'connecting' || state.scanning

  return (
    <div className="ufa:flex ufa:min-h-0 ufa:flex-1 ufa:flex-col">
      <header className="ufa:flex ufa:items-center ufa:gap-2 ufa:border-b ufa:border-border ufa:px-3 ufa:py-2">
        <h2
          className={cn(
            'ufa:flex-1 ufa:truncate ufa:text-sm ufa:font-semibold',
            hideTitle && 'ufa:sr-only',
          )}
        >
          {t('panel.title')}
        </h2>
        {hideTitle ? <span className="ufa:flex-1" aria-hidden /> : null}
        <ConnectionBadge status={state.status} />
        <Button
          variant="ghost"
          size="icon"
          onClick={reconnect}
          disabled={!controller || busy}
          aria-label={t('panel.refresh')}
          title={t('panel.refresh')}
        >
          <RotateCwIcon className={cn(busy && 'ufa:animate-spin')} />
        </Button>
      </header>
      <div className="ufa:flex ufa:min-h-0 ufa:flex-1 ufa:flex-col ufa:gap-3 ufa:overflow-y-auto ufa:p-3">
        <PanelContent state={state} host={host} onReconnect={reconnect} />
      </div>
    </div>
  )
}

function PanelContent({
  state,
  host,
  onReconnect,
}: {
  state: AutofillState
  host?: AutofillHost
  onReconnect: () => void
}): ReactNode {
  const t = useTranslate()

  if (state.status === 'connecting' && !state.page) {
    return (
      <div className="ufa:flex ufa:items-center ufa:justify-center ufa:gap-2 ufa:py-8 ufa:text-sm ufa:text-muted-foreground">
        <Spinner label={t('panel.connecting')} />
        {t('panel.connecting')}
      </div>
    )
  }

  if (state.status === 'error' && state.error) {
    switch (state.error.code) {
      case 'PERMISSION_REQUIRED':
        return state.error.reason === 'file-access' ? (
          <ErrorState message={state.error.message} onRetry={onReconnect} />
        ) : (
          <PermissionNotice
            site={state.error.site}
            onRequest={host?.requestPageAccess?.bind(host)}
            onGranted={onReconnect}
            onRetry={onReconnect}
          />
        )
      case 'RESTRICTED_PAGE':
        return <RestrictedPageState />
      case 'NO_TAB':
        return (
          <EmptyState
            icon={<SearchXIcon />}
            title={t('noTab.title')}
            description={t('noTab.body')}
          />
        )
      default:
        return <ErrorState message={state.error.message} onRetry={onReconnect} />
    }
  }

  if (state.page) {
    return (
      <>
        <PortalStatus page={state.page} />
        <FieldList fields={state.fields} scanning={state.scanning} />
      </>
    )
  }

  return <EmptyState icon={<PlugZapIcon />} title={t('status.idle')} />
}
