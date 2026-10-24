import type { AutofillTheme } from '@ufa/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'

export type SchemePreference = 'system' | 'light' | 'dark'

const KEY = 'ufa-ext:appearance'
const isPreference = (value: unknown): value is SchemePreference =>
  value === 'system' || value === 'light' || value === 'dark'

/** The light/dark choice, saved in extension storage so the side panel and options page agree. */
export function useSchemePreference() {
  const [preference, setPreference] = useState<SchemePreference>('system')

  useEffect(() => {
    void chrome.storage.local.get(KEY).then((stored) => {
      const value: unknown = stored[KEY]
      if (isPreference(value)) setPreference(value)
    })
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const value: unknown = changes[KEY]?.newValue
      if (area === 'local' && isPreference(value)) setPreference(value)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  useEffect(() => {
    document.documentElement.style.colorScheme = preference === 'system' ? 'light dark' : preference
  }, [preference])

  const update = useCallback((next: SchemePreference) => {
    setPreference(next)
    void chrome.storage.local.set({ [KEY]: next })
  }, [])

  const theme = useMemo<AutofillTheme>(() => ({ colorScheme: preference }), [preference])
  return { preference, update, theme }
}
