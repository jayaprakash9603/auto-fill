import type { AutofillController, AutofillHost, AutofillState } from '@ufa/autofill-sdk'
import { toAutofillError, type AutofillMode, type FillResult } from '@ufa/core'
import type { AutofillStore } from '@ufa/storage'
import { PlugZapIcon, RotateCwIcon, SearchXIcon } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { useAutofillController, useAutofillState } from '../hooks/use-autofill'
import { useStoreSnapshot } from '../hooks/use-store'
import { MessagesProvider, useTranslate, type AutofillMessages } from '../i18n/messages'
import { cn } from '../lib/cn'
import type { AutofillTheme } from '../theme/theme'
import { AutofillRoot } from './autofill-root'
import { AnswerLibrary } from './data/answer-library'
import { CustomFieldsManager } from './data/custom-fields'
import { DataManager } from './data/data-manager'
import { FillSettings } from './data/fill-settings'
import { ProfileManager } from './data/profile-manager'
import { ProfileSelector } from './data/profile-selector'
import { canSelectField, FieldList, isPreselected } from './field-list'
import { FillBar } from './fill-bar'
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
          <PanelContent state={state} controller={controller} host={host} onReconnect={reconnect} />
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
          <StoreGate store={store}>
            {(ready) => (
              <>
                <FillSettings store={ready} currentSite={state.page?.hostname ?? null} />
                <DataManager store={ready} className="ufa:border-t ufa:border-border ufa:pt-3" />
              </>
            )}
          </StoreGate>
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
  controller,
  host,
  onReconnect,
}: {
  state: AutofillState
  controller: AutofillController | null
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
        {controller ? (
          <PageFields key={state.page.url} state={state} controller={controller} />
        ) : (
          <FieldList fields={state.fields} matches={state.matches} scanning={state.scanning} />
        )}
      </>
    )
  }

  return <EmptyState icon={<PlugZapIcon />} title={t('status.idle')} />
}

/**
 * The page's fields with selection and the fill action. Confident matches start selected; the
 * user's own ticks and unticks are kept across rescans until the page changes.
 */
function PageFields({
  state,
  controller,
}: {
  state: AutofillState
  controller: AutofillController
}) {
  const t = useTranslate()
  const snapshot = useStoreSnapshot(controller.store)
  const mode = snapshot.settings.mode
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set())
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set())
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [lastResults, setLastResults] = useState<FillResult[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { selected, selectable } = useMemo(() => {
    const chosen = new Set<string>()
    const available: string[] = []
    if (mode === 'suggest') return { selected: chosen, selectable: available }
    for (const field of state.fields) {
      const match = state.matches[field.id]
      const decision = state.decisions[field.id]
      if (!canSelectField(match, decision, choices[field.id] !== undefined)) continue
      if (field.sensitivity === 'normal') available.push(field.id)
      const preselected = isPreselected(field, match, decision) && !unticked.has(field.id)
      if (ticked.has(field.id) || preselected) chosen.add(field.id)
    }
    return { selected: chosen, selectable: available }
  }, [state.fields, state.matches, state.decisions, choices, ticked, unticked, mode])

  const toggle = useCallback((fieldId: string, on: boolean) => {
    const add = (set: ReadonlySet<string>) => new Set([...set, fieldId])
    const remove = (set: ReadonlySet<string>) => new Set([...set].filter((id) => id !== fieldId))
    setTicked((current) => (on ? add(current) : remove(current)))
    setUnticked((current) => (on ? remove(current) : add(current)))
  }, [])

  const choose = useCallback(
    (fieldId: string, answerId: string) => {
      setChoices((current) => ({ ...current, [fieldId]: answerId }))
      toggle(fieldId, true)
    },
    [toggle],
  )

  const selectAll = useCallback(() => {
    setTicked((current) => new Set([...current, ...selectable]))
    setUnticked((current) => new Set([...current].filter((id) => !selectable.includes(id))))
  }, [selectable])

  const fill = useCallback(async () => {
    setMessage(null)
    try {
      setLastResults(await controller.fill({ fieldIds: [...selected], choices }))
    } catch (error) {
      setMessage(toAutofillError(error).message)
    }
  }, [controller, selected, choices])

  const undo = useCallback(async () => {
    setMessage(null)
    try {
      const restored = (await controller.undo()).filter((entry) => entry.status === 'restored')
      setLastResults(null)
      setMessage(
        restored.length === 1 ? t('fill.undoneOne') : t('fill.undone', { count: restored.length }),
      )
    } catch (error) {
      setMessage(toAutofillError(error).message)
    }
  }, [controller, t])

  const changeMode = useCallback(
    (next: AutofillMode) => {
      setMessage(null)
      void controller.store.settings
        .update({ mode: next })
        .catch((error: unknown) => setMessage(toAutofillError(error).message))
    },
    [controller],
  )

  const hasFields = state.fields.length > 0
  return (
    <>
      {hasFields && snapshot.status === 'ready' ? (
        <FillBar
          mode={mode}
          onModeChange={changeMode}
          selectedCount={selected.size}
          selectableCount={selectable.length}
          onFill={() => void fill()}
          onSelectAll={selectAll}
          filling={state.filling}
          canUndo={state.canUndo}
          onUndo={() => void undo()}
          lastResults={lastResults}
          message={message}
        />
      ) : null}
      <FieldList
        fields={state.fields}
        matches={state.matches}
        decisions={state.decisions}
        results={state.results}
        {...(mode === 'suggest' ? {} : { selected, onSelectedChange: toggle })}
        choices={choices}
        onChoiceChange={choose}
        answers={snapshot.answers}
        scanning={state.scanning}
      />
    </>
  )
}
