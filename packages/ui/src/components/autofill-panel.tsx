import type { AutofillController, AutofillHost, AutofillState } from '@ufa/autofill-sdk'
import { toAutofillError, type AutofillMode, type FillResult } from '@ufa/core'
import type { AutofillStore } from '@ufa/storage'
import { GraduationCapIcon, PlugZapIcon, SearchXIcon, ShieldCheckIcon } from 'lucide-react'
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
import { ClearConfirmationDialog } from './clear-confirmation-dialog'
import { LearningConfirmationDialog } from './learning-confirmation-dialog'
import { LiveConnection } from './portal-status'
import { EmptyState, ErrorState, PermissionNotice, RestrictedPageState } from './states'
import { Button } from './ui/button'
import { Label, Switch } from './ui/form-controls'
import { Skeleton } from './ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

export type AutofillPanelTab = 'page' | 'answers' | 'profiles' | 'data' | 'settings'

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
  /** Adds a Settings tab with the host's own settings (appearance, access, and so on). */
  settingsTab?: ReactNode
  className?: string
}

export function AutofillPanel({
  host,
  controller,
  theme,
  messages,
  embedded = false,
  defaultTab = 'page',
  settingsTab,
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
          settingsTab={settingsTab}
        />
      </MessagesProvider>
    </AutofillRoot>
  )
}

/**
 * The same scrollbar gutter on every row (header, tabs, scroll area, fill bar), so their edges line
 * up whether or not the tab content scrolls, and the width never jumps as content grows.
 */
const GUTTER = 'ufa:[scrollbar-gutter:stable] ufa:[scrollbar-width:thin]'
const SCROLL_AREA = cn(
  'ufa:flex ufa:min-h-0 ufa:flex-1 ufa:flex-col ufa:gap-3 ufa:overflow-y-auto ufa:overscroll-contain ufa:p-3',
  GUTTER,
)
const TAB_CONTENT = SCROLL_AREA
const PAGE_TAB_CONTENT = 'ufa:flex ufa:min-h-0 ufa:flex-1 ufa:flex-col'

function PanelBody({
  host,
  controller: external,
  hideTitle,
  defaultTab,
  settingsTab,
}: {
  host?: AutofillHost
  controller?: AutofillController
  /** The host page already shows a title; keep the heading for assistive technology only. */
  hideTitle: boolean
  defaultTab: AutofillPanelTab
  settingsTab?: ReactNode
}) {
  const t = useTranslate()
  const controller = useAutofillController(host, external)
  const state = useAutofillState(controller)
  const reconnect = useCallback(() => void controller?.connect(), [controller])
  const busy = state.status === 'connecting' || state.scanning
  const [tab, setTab] = useState<AutofillPanelTab>(defaultTab)
  const store = controller?.store ?? null
  const snapshot = useStoreSnapshot(store)
  const storeReady = Boolean(store) && snapshot.status === 'ready'

  return (
    <div className="ufa:flex ufa:min-h-0 ufa:flex-1 ufa:flex-col">
      <header
        className={cn(
          'ufa:flex ufa:shrink-0 ufa:flex-col ufa:gap-2 ufa:overflow-hidden ufa:px-3 ufa:pt-3 ufa:pb-2',
          GUTTER,
        )}
      >
        <h2
          className={cn('ufa:truncate ufa:text-sm ufa:font-semibold', hideTitle && 'ufa:sr-only')}
        >
          {t('panel.title')}
        </h2>
        <div className="ufa:overflow-hidden ufa:rounded-xl ufa:border ufa:border-border ufa:bg-card ufa:shadow-xs">
          <LiveConnection
            className="ufa:rounded-none ufa:border-0 ufa:bg-transparent ufa:shadow-none"
            status={state.status}
            page={state.page}
            busy={!controller || busy}
            onRefresh={reconnect}
          />
          <ProfileSelector
            store={store}
            className="ufa:border-t ufa:border-border ufa:bg-muted/30 ufa:px-2.5 ufa:py-2"
          />
        </div>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as AutofillPanelTab)}
        className="ufa:min-h-0 ufa:flex-1 ufa:gap-0"
      >
        <div className={cn('ufa:shrink-0 ufa:overflow-hidden ufa:px-3', GUTTER)}>
          <TabsList
            aria-label={t('tabs.label')}
            className="ufa:overflow-x-auto ufa:[scrollbar-width:none]"
          >
            <TabsTrigger value="page" count={state.page ? state.fields.length : undefined}>
              {t('tabs.page')}
            </TabsTrigger>
            <TabsTrigger value="answers" count={storeReady ? snapshot.answers.length : undefined}>
              {t('tabs.answers')}
            </TabsTrigger>
            <TabsTrigger value="profiles">{t('tabs.profiles')}</TabsTrigger>
            <TabsTrigger value="data">{t('tabs.data')}</TabsTrigger>
            {settingsTab ? <TabsTrigger value="settings">{t('tabs.settings')}</TabsTrigger> : null}
          </TabsList>
        </div>
        <TabsContent value="page" className={PAGE_TAB_CONTENT}>
          <PanelContent state={state} controller={controller} host={host} onReconnect={reconnect} />
        </TabsContent>
        <TabsContent value="answers" className={TAB_CONTENT}>
          <StoreGate store={store}>
            {(ready) => (
              <>
                <AnswerLibrary store={ready} />
                <CustomFieldsManager store={ready} />
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
                <DataManager store={ready} />
              </>
            )}
          </StoreGate>
        </TabsContent>
        {settingsTab ? (
          <TabsContent value="settings" className={TAB_CONTENT}>
            {settingsTab}
          </TabsContent>
        ) : null}
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
    <div
      data-slot="store-skeleton"
      role="status"
      aria-label={t('store.loading')}
      className="ufa:flex ufa:flex-col ufa:gap-3"
    >
      {[0, 1].map((key) => (
        <div
          key={key}
          aria-hidden
          className="ufa:overflow-hidden ufa:rounded-xl ufa:border ufa:border-border ufa:bg-card ufa:shadow-xs"
        >
          <div className="ufa:flex ufa:items-center ufa:gap-2.5 ufa:border-b ufa:border-border ufa:px-3 ufa:py-2.5">
            <Skeleton className="ufa:size-7" />
            <Skeleton className="ufa:h-3.5 ufa:w-28" />
            <Skeleton className="ufa:ml-auto ufa:h-8 ufa:w-24" />
          </div>
          <div className="ufa:flex ufa:flex-col ufa:gap-2 ufa:p-3">
            <Skeleton className="ufa:h-8 ufa:w-full" />
            <Skeleton className="ufa:h-3 ufa:w-3/5" />
          </div>
        </div>
      ))}
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
  if (state.page && controller)
    return <PageFields key={state.page.url} state={state} controller={controller} />
  return (
    <div className={SCROLL_AREA}>
      <PageState state={state} host={host} onReconnect={onReconnect} />
    </div>
  )
}

function PageState({
  state,
  host,
  onReconnect,
}: {
  state: AutofillState
  host?: AutofillHost
  onReconnect: () => void
}): ReactNode {
  const t = useTranslate()

  if (state.status === 'connecting' && !state.page) return <FieldListSkeleton />

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

  if (state.page)
    return <FieldList fields={state.fields} matches={state.matches} scanning={state.scanning} />

  return <EmptyState icon={<PlugZapIcon />} title={t('status.idle')} />
}

/** Placeholder rows while the page connects, shaped like the field list that replaces them. */
function FieldListSkeleton() {
  const t = useTranslate()
  return (
    <div
      data-slot="field-list-skeleton"
      role="status"
      aria-label={t('panel.connecting')}
      className="ufa:flex ufa:flex-col ufa:gap-2"
    >
      <div className="ufa:grid ufa:grid-cols-3 ufa:gap-2" aria-hidden>
        {[0, 1, 2].map((key) => (
          <div
            key={key}
            className="ufa:h-14 ufa:rounded-lg ufa:bg-muted ufa:motion-safe:animate-pulse"
          />
        ))}
      </div>
      <div
        className="ufa:overflow-hidden ufa:rounded-xl ufa:border ufa:border-border ufa:bg-card ufa:shadow-xs"
        aria-hidden
      >
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="ufa:flex ufa:items-center ufa:gap-3 ufa:border-b ufa:border-border ufa:px-3 ufa:py-3 ufa:last:border-b-0"
          >
            <div className="ufa:size-4 ufa:rounded-sm ufa:bg-muted ufa:motion-safe:animate-pulse" />
            <div className="ufa:flex ufa:flex-1 ufa:flex-col ufa:gap-1.5">
              <div className="ufa:h-3 ufa:w-2/5 ufa:rounded-sm ufa:bg-muted ufa:motion-safe:animate-pulse" />
              <div className="ufa:h-2.5 ufa:w-3/5 ufa:rounded-sm ufa:bg-muted ufa:motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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
  const [learningId, setLearningId] = useState<string | null>(null)
  const [learningBusy, setLearningBusy] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const candidates = Object.values(state.learningCandidates)
  const activeCandidate = learningId ? (state.learningCandidates[learningId] ?? null) : null

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

  const runGenerate = useCallback(async () => {
    setMessage(null)
    try {
      const results = await controller.generate({ fieldIds: [...selected] })
      setMessage(t('fill.generated', { count: results.length }))
    } catch (error) {
      setMessage(toAutofillError(error).message)
    }
  }, [controller, selected, t])

  const runClear = useCallback(async () => {
    setMessage(null)
    setClearOpen(false)
    try {
      const results = await controller.clear({ fieldIds: [...selected] })
      const cleared = results.filter((entry) => entry.status === 'cleared').length
      const failed = results.filter((entry) => entry.status === 'failed').length
      const skipped = results.filter((entry) => entry.status === 'skipped').length
      setMessage(t('clear.summary', { cleared, failed, skipped }))
      setLastResults(null)
    } catch (error) {
      setMessage(toAutofillError(error).message)
    }
  }, [controller, selected, t])

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
  const ready = hasFields && snapshot.status === 'ready'
  return (
    <>
      <div className={SCROLL_AREA} data-slot="page-scroll">
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
          generated={state.generated}
          clearResults={state.clearResults}
        />
        {ready ? (
          <div
            data-slot="learning-bar"
            className="ufa:flex ufa:items-center ufa:gap-2.5 ufa:rounded-xl ufa:border ufa:border-border ufa:bg-card ufa:px-3 ufa:py-2.5 ufa:shadow-xs"
          >
            <span
              aria-hidden
              className="ufa:flex ufa:size-7 ufa:shrink-0 ufa:items-center ufa:justify-center ufa:rounded-md ufa:bg-primary/10 ufa:text-primary"
            >
              <GraduationCapIcon className="ufa:size-4" />
            </span>
            <div className="ufa:min-w-0 ufa:flex-1">
              <Label htmlFor="learning-arm" className="ufa:text-[13px]">
                {t('learning.arm')}
              </Label>
              <p className="ufa:text-xs ufa:text-muted-foreground">{t('learning.armHint')}</p>
            </div>
            {candidates.length > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                className="ufa:shrink-0"
                onClick={() => setLearningId(candidates[0]!.id)}
              >
                {t('learning.review')} ({candidates.length})
              </Button>
            ) : null}
            <Switch
              id="learning-arm"
              checked={state.learningArmed}
              disabled={!snapshot.settings.learning.allowed}
              onCheckedChange={(checked) => void controller.setLearningArmed(checked)}
            />
          </div>
        ) : null}
        {ready && mode !== 'suggest' ? (
          <p className="ufa:flex ufa:items-start ufa:gap-1.5 ufa:px-1 ufa:text-xs ufa:text-muted-foreground">
            <ShieldCheckIcon aria-hidden className="ufa:mt-px ufa:size-3.5 ufa:shrink-0" />
            <span>
              {t('fill.never')} {t('fill.consentHint')}
            </span>
          </p>
        ) : null}
      </div>
      {ready ? (
        <FillBar
          className={cn(
            'ufa:shrink-0 ufa:overflow-hidden ufa:rounded-none ufa:border-x-0 ufa:border-b-0 ufa:shadow-[0_-6px_16px_-12px_rgb(0_0_0/0.35)]',
            GUTTER,
          )}
          mode={mode}
          onModeChange={changeMode}
          selectedCount={selected.size}
          selectableCount={selectable.length}
          onFill={() => void fill()}
          onSelectAll={selectAll}
          filling={state.filling}
          canUndo={state.canUndo}
          onUndo={() => void undo()}
          syntheticEnabled={snapshot.settings.synthetic.enabled}
          onGenerate={() => void runGenerate()}
          onClear={() => setClearOpen(true)}
          lastResults={lastResults}
          message={message}
        />
      ) : null}
      <ClearConfirmationDialog
        open={clearOpen}
        fieldCount={selected.size}
        onOpenChange={setClearOpen}
        onConfirm={() => void runClear()}
        busy={state.filling}
      />
      <LearningConfirmationDialog
        candidate={activeCandidate}
        open={learningId !== null}
        busy={learningBusy}
        onOpenChange={(open) => {
          if (!open) setLearningId(null)
        }}
        onReject={() => {
          if (learningId) controller.rejectLearning(learningId)
          setLearningId(null)
        }}
        onConfirm={(draft) => {
          if (!learningId) return
          setLearningBusy(true)
          void controller
            .confirmLearning(learningId, draft)
            .then(() => setLearningId(null))
            .catch((error: unknown) => setMessage(toAutofillError(error).message))
            .finally(() => setLearningBusy(false))
        }}
      />
    </>
  )
}
