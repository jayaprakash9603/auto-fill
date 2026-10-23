import { AutofillError } from '@ufa/core'

import type { ChromeLike, TabLike } from './chrome-like'

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-untrusted://',
  'chrome-search://',
  'edge://',
  'brave://',
  'opera://',
  'vivaldi://',
  'about:',
  'devtools://',
  'view-source:',
  'moz-extension://',
]

const RESTRICTED_HOSTS = [
  'chrome.google.com/webstore',
  'chromewebstore.google.com',
  'microsoftedge.microsoft.com/addons',
]

/** Pages browsers never let extensions script. */
export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return (
    RESTRICTED_PREFIXES.some((prefix) => lower.startsWith(prefix)) ||
    RESTRICTED_HOSTS.some((host) => lower.includes(host))
  )
}

export function isScriptableUrl(url: string | undefined): boolean {
  if (!url || isRestrictedUrl(url)) return false
  return /^(https?|file):/i.test(url)
}

/** `https://example.com/*` style match pattern for a page URL, or null for non-web pages. */
export function originPattern(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return `${parsed.protocol}//${parsed.hostname}/*`
  } catch {
    return null
  }
}

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

/**
 * The web page the user is looking at: the active tab of the last focused normal window, skipping
 * extension pages (such as a side panel opened as a tab) and browser pages.
 *
 * Without the "tabs" permission Chrome hides the URL of tabs the extension has no access to. Such
 * an active tab is still returned, so the caller can report that access is needed instead of
 * silently picking a different tab.
 */
export async function resolveActiveWebTab(chrome: ChromeLike): Promise<TabLike | undefined> {
  try {
    const win = await chrome.windows?.getLastFocused({ populate: true, windowTypes: ['normal'] })
    const active = win?.tabs?.find((tab) => tab.active)
    if (active?.id != null && (isScriptableUrl(active.url) || active.url === undefined))
      return active
  } catch {
    /* fall through to tab queries */
  }
  const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (focused?.id != null && (isScriptableUrl(focused.url) || focused.url === undefined))
    return focused
  if (focused?.id != null && isRestrictedUrl(focused.url)) return focused
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file://*/*'] })
  return [...tabs]
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
    .find((tab) => tab.id != null)
}

/** Maps a `chrome.scripting` failure to an actionable error code. */
export function classifyInjectionError(error: unknown, url: string | undefined): AutofillError {
  const message = error instanceof Error ? error.message : String(error)
  if (url?.toLowerCase().startsWith('file:') || /file access/i.test(message)) {
    return new AutofillError(
      'PERMISSION_REQUIRED',
      'Enable "Allow access to file URLs" for this extension to use local files.',
      {
        details: { reason: 'file-access' },
      },
    )
  }
  if (
    /must request permission|cannot access contents|missing host permission|permission/i.test(
      message,
    )
  ) {
    return new AutofillError(
      'PERMISSION_REQUIRED',
      'This extension needs access to this site before it can read the form.',
      {
        details: { origin: originPattern(url), site: hostnameOf(url) },
      },
    )
  }
  if (/cannot be scripted|extensions gallery|chrome:\/\/|cannot access a chrome/i.test(message)) {
    return new AutofillError(
      'RESTRICTED_PAGE',
      'Browser pages and extension stores cannot be autofilled.',
    )
  }
  return new AutofillError('INJECTION_FAILED', message || 'Could not start the page runtime.', {
    cause: error,
  })
}
