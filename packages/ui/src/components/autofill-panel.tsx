import type { AutofillController, AutofillHost, AutofillState } from '@ufa/autofill-sdk'
import type { AutofillStore } from '@ufa/storage'
import { PlugZapIcon, RotateCwIcon, SearchXIcon } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'

import { useAutofillController, useAutofillState } from '../hooks/use-autofill'
import { useStoreSnapshot } from '../hooks/use-store'
import { MessagesProvider, useTranslate, type AutofillMessages } from '../i18n/messages'
import { cn } from '../lib/cn'
import type { AutofillTheme } from '../theme/theme'
import { AutofillRoot } from './autofill-root'
import { AnswerLibrary } from './data/answer-library'
import { CustomFieldsManager } from './data/custom-fields'
import { DataManager } from './data/data-manager'
import { ProfileManager } from './data/profile-manager'
import { ProfileSelector } from './data/profile-selector'
import { FieldList } from './field-list'
import { ConnectionBadge, PortalStatus } from './portal-status'
import { EmptyState, ErrorState, PermissionNotice, RestrictedPageState } from './states'
import { Button } from './ui/button'
import { Spinner } from './ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

export type AutofillPanelTab = 'page' | 'answers' | 'profiles' | 'data'

export interface AutofillPanelProps {
  /** Supplies controllers (and page access requests). Either `host` or `controller` is required. */
  host?: AutofillHost
  /** An existing controller; the panel connects it if idle but never destroys it. */
  controller?: AutofillController
  theme?: AutofillTheme
  messages?: AutofillMessages
  /** Removes the panel's own frame so it sits flush inside a host layout. */
  embedded?: boolean
  /** Tab shown first. Defaults to the page's fields. */
  defaultTab?: AutofillPanelTab
  className?: string
}

export function AutofillPanel({
  host,
  controller,
  theme,
  messages,
  embedded = false,
  defaultTab = 'page',
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
        <PanelBody
          host={host}
          controller={controller}
          hideTitle={embedded}
          defaultTab={defaultTab}
        />
      </MessagesProvider>
    </AutofillRoot>
  )
}

const TAB_CONTENT =
  'ufa:flex ufa:min-h-0 ufa:flex-1 ufa:flex-col ufa:gap-3 ufa:overflow-y-auto ufa:p-3'

function PanelBody({
  host,
  controller: external,
  hideTitle,
  defaultTab,
}: {
  host?: AutofillHost
  controller?: AutofillController
  /** The host page already shows a title; keep the heading for assistive technology only. */
  hideTitle: boolean
  defaultTab: AutofillPanelTab
}) {
  const t = useTranslate()
  const controller = useAutofillController(host, external)
  const state = useAutofillState(controller)
  const reconnect = useCallback(() => void controller?.connect(), [controller])
  const busy = state.status === 'connecting' || state.scanning
  const [tab, setTab] = useState<AutofillPanelTab>(defaultTab)
  const store = controller?.store ?? null

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
      <div className="ufa:px-3 ufa:pt-2">
        <ProfileSelector store={store} />
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as AutofillPanelTab)}
        className="ufa:min-h-0 ufa:flex-1 ufa:gap-0 ufa:pt-2"
      >
        <div className="ufa:px-3">
          <TabsList aria-label={t('tabs.label')}>
            <TabsTrigger value="page">{t('tabs.page')}</TabsTrigger>
            <TabsTrigger value="answers">{t('tabs.answers')}</TabsTrigger>
            <TabsTrigger value="profiles">{t('tabs.profiles')}</TabsTrigger>
            <TabsTrigger value="data">{t('tabs.data')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="page" className={TAB_CONTENT}>
          <PanelContent state={state} host={host} onReconnect={reconnect} />
        </TabsContent>
        <TabsContent value="answers" className={TAB_CONTENT}>
          <StoreGate store={store}>
            {(ready) => (
              <>
                <AnswerLibrary store={ready} />
                <CustomFieldsManager
                  store={ready}
                  className="ufa:border-t ufa:border-border ufa:pt-3"
                />
              </>
            )}
          </StoreGate>
        </TabsContent>
        <TabsContent value="profiles" className={TAB_CONTENT}>
          <StoreGate store={store}>{(ready) => <ProfileManager store={ready} />}</StoreGate>
        </TabsContent>
        <TabsContent value="data" className={TAB_CONTENT}>
          <StoreGate store={store}>{(ready) => <DataManager store={ready} />}</StoreGate>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Shows saved-data views once the store has loaded, and explains when it cannot. */
function StoreGate({
  store,
  children,
}: {
  store: AutofillStore | null
  children: (store: AutofillStore) => ReactNode
}) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(store)
  if (store && snapshot.status === 'ready') return children(store)
  if (snapshot.status === 'error')
    return (
      <ErrorState
        message={snapshot.error?.message || t('store.unavailable')}
        onRetry={snapshot.error?.reason === 'newer-schema' ? undefined : () => void store?.reload()}
      />
    )
  return (
    <div className="ufa:flex ufa:items-center ufa:justify-center ufa:gap-2 ufa:py-8 ufa:text-sm ufa:text-muted-foreground">
      <Spinner label={t('store.loading')} />
      <span aria-hidden="true">{t('store.loading')}</span>
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
        <FieldList fields={state.fields} matches={state.matches} scanning={state.scanning} />
      </>
    )
  }

  return <EmptyState icon={<PlugZapIcon />} title={t('status.idle')} />
}
