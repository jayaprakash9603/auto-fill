import {
  AnswerLibrary,
  AutofillRoot,
  CustomFieldsManager,
  DataManager,
  ErrorState,
  FillSettings,
  ProfileManager,
  ProfileSelector,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useStoreSnapshot,
} from '@ufa/ui'
import type { AutofillStore } from '@ufa/storage'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { createHost } from '../shared/host'
import { AccessSettings, AppearanceSettings } from '../shared/settings-sections'
import { useSchemePreference } from '../shared/theme'

const SECTIONS = ['answers', 'profiles', 'filling', 'data', 'access'] as const
type Section = (typeof SECTIONS)[number]

const sectionFromHash = (): Section => {
  const hash = location.hash.slice(1)
  return (SECTIONS as readonly string[]).includes(hash) ? (hash as Section) : 'answers'
}

function useSection() {
  const [section, setSection] = useState<Section>(sectionFromHash)
  useEffect(() => {
    const sync = () => setSection(sectionFromHash())
    addEventListener('hashchange', sync)
    return () => removeEventListener('hashchange', sync)
  }, [])
  const choose = useCallback((next: string) => {
    setSection(next as Section)
    history.replaceState(null, '', `#${next}`)
  }, [])
  return [section, choose] as const
}

function StoreReady({ store, children }: { store: AutofillStore; children: ReactNode }) {
  const snapshot = useStoreSnapshot(store)
  if (snapshot.status === 'ready') return children
  if (snapshot.status === 'error')
    return (
      <ErrorState
        message={snapshot.error?.message ?? 'Your saved data is unavailable.'}
        onRetry={snapshot.error?.reason === 'newer-schema' ? undefined : () => void store.reload()}
      />
    )
  return (
    <div className="ufa:flex ufa:justify-center ufa:py-10">
      <Spinner label="Loading your saved data" />
    </div>
  )
}

export function OptionsPage() {
  const [store] = useState(() => createHost().getStore())
  const [section, chooseSection] = useSection()
  const { preference, update, theme } = useSchemePreference()
  const version = chrome.runtime.getManifest().version

  return (
    <AutofillRoot theme={theme} className="ufa:min-h-full">
      <main className="ufa:mx-auto ufa:flex ufa:max-w-3xl ufa:flex-col ufa:gap-4 ufa:px-4 ufa:py-8">
        <header className="ufa:flex ufa:flex-wrap ufa:items-center ufa:gap-3">
          <img src="/icons/icon-48.png" alt="" className="ufa:size-10" />
          <div className="ufa:flex-1">
            <h1 className="ufa:text-lg ufa:font-semibold">Universal Form Autofill</h1>
            <p className="ufa:text-xs ufa:text-muted-foreground">Version {version}</p>
          </div>
          <ProfileSelector store={store} className="ufa:w-56" />
        </header>

        <Tabs value={section} onValueChange={chooseSection}>
          <TabsList aria-label="Settings sections" className="ufa:overflow-x-auto">
            <TabsTrigger value="answers">Answers</TabsTrigger>
            <TabsTrigger value="profiles">Profiles</TabsTrigger>
            <TabsTrigger value="filling">Filling</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="access">Appearance &amp; access</TabsTrigger>
          </TabsList>
          <TabsContent value="answers" className="ufa:flex ufa:flex-col ufa:gap-4">
            <StoreReady store={store}>
              <AnswerLibrary store={store} />
              <CustomFieldsManager store={store} />
            </StoreReady>
          </TabsContent>
          <TabsContent value="profiles">
            <StoreReady store={store}>
              <ProfileManager store={store} />
            </StoreReady>
          </TabsContent>
          <TabsContent value="filling">
            <StoreReady store={store}>
              <FillSettings store={store} />
            </StoreReady>
          </TabsContent>
          <TabsContent value="data">
            <StoreReady store={store}>
              <DataManager store={store} />
            </StoreReady>
          </TabsContent>
          <TabsContent value="access" className="ufa:flex ufa:flex-col ufa:gap-4">
            <AppearanceSettings preference={preference} onChange={update} />
            <AccessSettings />
          </TabsContent>
        </Tabs>
      </main>
    </AutofillRoot>
  )
}
