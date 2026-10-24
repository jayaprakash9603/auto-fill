import type { PortalAdapter, PortalContext } from '@ufa/core'

export const LEVER_ADAPTER: PortalAdapter = {
  id: 'lever',
  apiVersion: 1,
  order: 110,
  name: 'Lever',
  version: '1.0.0',
  sitePatterns: ['jobs.lever.co', 'lever.co'],
  capabilities: ['detect', 'fill-text', 'fill-select', 'fill-radio', 'fill-checkbox'],
  limitations: [
    'Targets the standard Lever posting application form.',
    'Lever-hosted custom domains are detected only when the application form markers are present.',
  ],
  canHandle(context: PortalContext) {
    if (!context.hostname.endsWith('lever.co')) return false
    return Boolean(
      context.document.querySelector('form.application-form, .application-form, form.postings-form'),
    )
  },
}
