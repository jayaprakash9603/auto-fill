import {
  AnswerLibrary,
  AutofillRoot,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CustomFieldsManager,
  DataManager,
  EmptyState,
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
import { GlobeLockIcon, KeyboardIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { createHost } from '../shared/host'

const WEB_ORIGIN = /^https?:\/\//
const SECTIONS = ['answers', 'profiles', 'filling', 'data', 'access'] as const
type Section = (typeof SECTIONS)[number]

const sectionFromHash = (): Section => {
  const hash = location.hash.slice(1)
  return (SECTIONS as readonly string[]).includes(hash) ? (hash as Section) : 'answers'
}

function useGrantedOrigins() {
  const [origins, setOrigins] = useState<string[]>([])
  const refresh = useCallback(() => {
    void chrome.permissions
      .getAll()
      .then((all) =>
        setOrigins((all.origins ?? []).filter((origin) => WEB_ORIGIN.test(origin)).sort()),
      )
  }, [])
  useEffect(() => {
    refresh()
    chrome.permissions.onAdded.addListener(refresh)
    chrome.permissions.onRemoved.addListener(refresh)
    return () => {
      chrome.permissions.onAdded.removeListener(refresh)
      chrome.permissions.onRemoved.removeListener(refresh)
    }
  }, [refresh])
  return origins
}

function useShortcut(name: string) {
  const [shortcut, setShortcut] = useState<string | null>(null)
  useEffect(() => {
    void chrome.commands
      .getAll()
      .then((commands) =>
        setShortcut(commands.find((command) => command.name === name)?.shortcut || null),
      )
  }, [name])
  return shortcut
}

const REQUIRED_ORIGINS = new Set(chrome.runtime.getManifest().host_permissions ?? [])

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
  const version = chrome.runtime.getManifest().version

  return (
    <AutofillRoot className="ufa:min-h-full">
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
          <TabsList aria-label="Settings sections" className="ufa:self-start">
            <TabsTrigger value="answers">Answers</TabsTrigger>
            <TabsTrigger value="profiles">Profiles</TabsTrigger>
            <TabsTrigger value="filling">Filling</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="access">Site access &amp; privacy</TabsTrigger>
          </TabsList>
          <TabsContent value="answers" className="ufa:flex ufa:flex-col ufa:gap-4">
            <StoreReady store={store}>
              <Card>
                <CardContent className="ufa:pt-4">
                  <AnswerLibrary store={store} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="ufa:pt-4">
                  <CustomFieldsManager store={store} />
                </CardContent>
              </Card>
            </StoreReady>
          </TabsContent>
          <TabsContent value="profiles">
            <StoreReady store={store}>
              <Card>
                <CardContent className="ufa:pt-4">
                  <ProfileManager store={store} />
                </CardContent>
              </Card>
            </StoreReady>
          </TabsContent>
          <TabsContent value="filling">
            <StoreReady store={store}>
              <Card>
                <CardContent className="ufa:pt-4">
                  <FillSettings store={store} />
                </CardContent>
              </Card>
            </StoreReady>
          </TabsContent>
          <TabsContent value="data">
            <StoreReady store={store}>
              <Card>
                <CardContent className="ufa:pt-4">
                  <DataManager store={store} />
                </CardContent>
              </Card>
            </StoreReady>
          </TabsContent>
          <TabsContent value="access" className="ufa:flex ufa:flex-col ufa:gap-4">
            <AccessSettings />
          </TabsContent>
        </Tabs>
      </main>
    </AutofillRoot>
  )
}

function AccessSettings() {
  const origins = useGrantedOrigins()
  const shortcut = useShortcut('open-side-panel')

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="ufa:flex ufa:items-center ufa:gap-2">
            <GlobeLockIcon className="ufa:size-4" /> Site access
          </CardTitle>
          <CardDescription>
            Autofill only reads pages you open it on. Sites listed here were allowed permanently;
            removing one takes effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {origins.length === 0 ? (
            <EmptyState
              className="ufa:py-4"
              title="No sites allowed permanently"
              description="Use the toolbar button on a page to grant one-time access, or allow a site from the side panel."
            />
          ) : (
            <ul
              className="ufa:flex ufa:flex-col ufa:divide-y ufa:divide-border ufa:rounded-md ufa:border ufa:border-border"
              aria-label="Allowed sites"
            >
              {origins.map((origin) => (
                <li
                  key={origin}
                  className="ufa:flex ufa:items-center ufa:gap-2 ufa:px-3 ufa:py-2 ufa:text-sm"
                >
                  <span className="ufa:flex-1 ufa:truncate ufa:font-mono ufa:text-xs">
                    {origin}
                  </span>
                  {REQUIRED_ORIGINS.has(origin) ? (
                    <Badge variant="muted">Required</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void chrome.permissions.remove({ origins: [origin] })}
                      aria-label={`Remove access to ${origin}`}
                    >
                      <Trash2Icon /> Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="ufa:flex ufa:items-center ufa:gap-2">
            <KeyboardIcon className="ufa:size-4" /> Keyboard shortcut
          </CardTitle>
          <CardDescription>Open the side panel without the mouse.</CardDescription>
        </CardHeader>
        <CardContent className="ufa:flex ufa:items-center ufa:gap-2">
          {shortcut ? (
            <Badge variant="outline">{shortcut}</Badge>
          ) : (
            <span className="ufa:text-xs ufa:text-muted-foreground">Not set</span>
          )}
          <Button
            variant="link"
            size="sm"
            onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Change shortcut
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="ufa:flex ufa:items-center ufa:gap-2">
            <ShieldCheckIcon className="ufa:size-4" /> Privacy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="ufa:flex ufa:list-disc ufa:flex-col ufa:gap-1 ufa:pl-5 ufa:text-xs ufa:text-muted-foreground">
            <li>
              Your answers stay in this browser's extension storage. Nothing is sent to a server.
            </li>
            <li>Passwords, one-time codes and payment details are never read or saved.</li>
            <li>
              Forms are never submitted for you, and consent boxes are never ticked automatically.
            </li>
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
