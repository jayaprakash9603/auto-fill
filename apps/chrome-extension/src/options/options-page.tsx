import {
  AutofillRoot,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@ufa/ui'
import { GlobeLockIcon, KeyboardIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

const WEB_ORIGIN = /^https?:\/\//

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

export function OptionsPage() {
  const origins = useGrantedOrigins()
  const shortcut = useShortcut('open-side-panel')
  const version = chrome.runtime.getManifest().version

  return (
    <AutofillRoot className="ufa:min-h-full">
      <main className="ufa:mx-auto ufa:flex ufa:max-w-2xl ufa:flex-col ufa:gap-4 ufa:px-4 ufa:py-8">
        <header className="ufa:flex ufa:items-center ufa:gap-3">
          <img src="/icons/icon-48.png" alt="" className="ufa:size-10" />
          <div className="ufa:flex-1">
            <h1 className="ufa:text-lg ufa:font-semibold">Universal Form Autofill</h1>
            <p className="ufa:text-xs ufa:text-muted-foreground">Version {version}</p>
          </div>
        </header>

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
      </main>
    </AutofillRoot>
  )
}
