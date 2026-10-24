import type { PortalAdapter, PortalContext } from '@ufa/core'

/** Fallback when no vendor-specific adapter matches the page. */
export const GENERIC_PORTAL_ADAPTER: PortalAdapter = {
  id: 'generic',
  apiVersion: 1,
  order: 10_000,
  name: 'Generic form',
  version: '1.0.0',
  sitePatterns: ['*'],
  capabilities: ['detect', 'fill-text', 'fill-select', 'fill-radio', 'fill-checkbox'],
  limitations: ['No portal-specific widgets; uses native controls and ARIA patterns only.'],
  canHandle(_context: PortalContext) {
    return true
  },
}
