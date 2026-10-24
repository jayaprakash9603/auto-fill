import { PLUGIN_API_VERSION, type DetectedControl, type FieldDetector, type PortalAdapter, type PortalContext } from '@ufa/core'

const WORKDAY_AUTOMATION_DETECTOR: FieldDetector = {
  id: 'ufa.portal.workday.automation',
  apiVersion: PLUGIN_API_VERSION,
  order: 50,
  detect(root) {
    const controls: DetectedControl[] = []
    for (const element of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input[data-automation-id], textarea[data-automation-id], select[data-automation-id]',
    )) {
      if (element.type === 'hidden') continue
      const label = element.getAttribute('data-automation-id') ?? undefined
      controls.push({
        kind: element instanceof HTMLSelectElement ? 'select' : element.type === 'checkbox' ? 'checkbox' : 'text',
        element,
        labelOverride: label,
        confidence: 0.85,
      })
    }
    return controls
  },
}

export const WORKDAY_ADAPTER: PortalAdapter = {
  id: 'workday',
  apiVersion: 1,
  order: 90,
  name: 'Workday',
  version: '1.0.0',
  sitePatterns: ['myworkdayjobs.com', 'workday.com'],
  capabilities: ['detect', 'fill-text', 'fill-select', 'multi-step', 'iframe-embed'],
  limitations: [
    'Apply flows behind sign-in are not inspected; only public job-posting pages are supported.',
    'Multi-step apply wizards may require rescans between steps.',
    'Workday custom themes can hide automation ids; generic detection is used when markers are missing.',
  ],
  detectors: [WORKDAY_AUTOMATION_DETECTOR],
  canHandle(context: PortalContext) {
    const hostOk =
      context.hostname.endsWith('myworkdayjobs.com') || context.hostname.endsWith('workday.com')
    if (!hostOk) return false
    return Boolean(
      context.document.querySelector('[data-automation-id], [data-automation-label]') ||
        context.document.querySelector('meta[name="workday"]'),
    )
  },
}
