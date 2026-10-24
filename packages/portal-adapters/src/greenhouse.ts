import type { PortalAdapter, PortalContext } from '@ufa/core'

export const GREENHOUSE_ADAPTER: PortalAdapter = {
  id: 'greenhouse',
  apiVersion: 1,
  order: 100,
  name: 'Greenhouse',
  version: '1.0.0',
  sitePatterns: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
  capabilities: ['detect', 'fill-text', 'fill-select', 'fill-radio', 'fill-checkbox', 'iframe-embed'],
  limitations: [
    'Assumes the standard Greenhouse application form markup.',
    'Custom Greenhouse boards with heavy DOM changes may fall back to generic detection.',
  ],
  canHandle(context: PortalContext) {
    if (!context.hostname.endsWith('greenhouse.io')) return false
    return Boolean(
      context.document.querySelector('#application_form, form#application, .application-form'),
    )
  },
}
