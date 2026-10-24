import type { PortalAdapter, PortalContext } from '@ufa/core'

export const ASHBY_ADAPTER: PortalAdapter = {
  id: 'ashby',
  apiVersion: 1,
  order: 120,
  name: 'Ashby',
  version: '1.0.0',
  sitePatterns: ['jobs.ashbyhq.com', 'ashbyhq.com'],
  capabilities: ['detect', 'fill-text', 'fill-select', 'fill-combobox'],
  limitations: [
    'Supports Ashby-hosted job application forms with standard field markup.',
    'Ashby custom application questions may need generic detection.',
  ],
  canHandle(context: PortalContext) {
    if (!context.hostname.includes('ashbyhq.com')) return false
    return Boolean(
      context.document.querySelector('form[data-ashby-application], .ashby-application-form, form'),
    )
  },
}
