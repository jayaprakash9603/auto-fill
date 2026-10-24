import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Label,
  SimpleSelect,
} from '@ufa/ui'
import { GlobeLockIcon, KeyboardIcon, PaletteIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'

import type { SchemePreference } from './theme'

const WEB_ORIGIN = /^https?:\/\//
const REQUIRED_ORIGINS = new Set(chrome.runtime.getManifest().host_permissions ?? [])

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

export function AppearanceSettings({
  preference,
  onChange,
}: {
  preference: SchemePreference
  onChange: (next: SchemePreference) => void
}) {
  const id = useId()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="ufa:flex ufa:items-center ufa:gap-2">
          <PaletteIcon className="ufa:size-4" /> Appearance
        </CardTitle>
        <CardDescription>Applies to the side panel and this settings page.</CardDescription>
      </CardHeader>
      <CardContent className="ufa:flex ufa:items-center ufa:gap-3">
        <Label htmlFor={id} className="ufa:flex-1">
          Theme
        </Label>
        <SimpleSelect
          id={id}
          className="ufa:w-36"
          value={preference}
          onValueChange={(next) => onChange(next as SchemePreference)}
          options={[
            { value: 'system', label: 'Match system' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </CardContent>
    </Card>
  )
}

/** Site access, shortcut and privacy notes: shown on the options page and in the side panel. */
export function AccessSettings() {
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
              description="Click the toolbar button on a page to grant one-time access, or allow a site from the side panel."
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
                  <span className="ufa:min-w-0 ufa:flex-1 ufa:truncate ufa:font-mono ufa:text-xs">
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
        <CardContent className="ufa:flex ufa:flex-wrap ufa:items-center ufa:gap-2">
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
