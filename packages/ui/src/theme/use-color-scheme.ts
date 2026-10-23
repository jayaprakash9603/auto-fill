import { useSyncExternalStore } from 'react'

import type { ColorScheme, ResolvedColorScheme } from './theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function systemScheme(): ResolvedColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Reads the host page's scheme from the conventions shadcn/ui, next-themes and daisyUI use. */
export function detectHostScheme(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): ResolvedColorScheme | null {
  const root = doc?.documentElement
  if (!root) return null
  if (root.classList.contains('dark')) return 'dark'
  if (root.classList.contains('light')) return 'light'
  const attribute =
    root.getAttribute('data-theme') ??
    root.getAttribute('data-color-scheme') ??
    root.getAttribute('data-mode')
  if (attribute === 'dark' || attribute === 'light') return attribute
  const declared = root.style.colorScheme
  if (declared === 'dark' || declared === 'light') return declared
  return null
}

function subscribeSystem(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener?.('change', onChange)
  return () => query.removeEventListener?.('change', onChange)
}

function subscribeHost(onChange: () => void): () => void {
  const unsubscribeSystem = subscribeSystem(onChange)
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined')
    return unsubscribeSystem
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-mode', 'style'],
  })
  return () => {
    observer.disconnect()
    unsubscribeSystem()
  }
}

const noopSubscribe = () => () => {}

export function resolveColorScheme(scheme: ColorScheme | undefined): ResolvedColorScheme {
  if (scheme === 'light' || scheme === 'dark') return scheme
  if (scheme === 'inherit') return detectHostScheme() ?? systemScheme()
  return systemScheme()
}

export function useResolvedColorScheme(scheme: ColorScheme | undefined): ResolvedColorScheme {
  const subscribe =
    scheme === 'inherit'
      ? subscribeHost
      : scheme === 'light' || scheme === 'dark'
        ? noopSubscribe
        : subscribeSystem
  return useSyncExternalStore(
    subscribe,
    () => resolveColorScheme(scheme),
    () => (scheme === 'dark' ? 'dark' : 'light'),
  )
}
