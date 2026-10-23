import { defineManifest } from '@crxjs/vite-plugin'

import pkg from './package.json' with { type: 'json' }

const ICONS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

/** Only the end-to-end build may reach the local fixture server without a permission prompt. */
const E2E_HOST_PERMISSIONS = ['http://127.0.0.1/*', 'http://localhost/*']

export default defineManifest((env) => ({
  manifest_version: 3,
  name: 'Universal Form Autofill',
  short_name: 'Form Autofill',
  description:
    'Fill forms with answers you control. Local-only, review before filling, never submits for you.',
  version: pkg.version,
  minimum_chrome_version: '116',
  icons: ICONS,
  action: {
    default_title: 'Universal Form Autofill',
    default_popup: 'src/popup/index.html',
    default_icon: ICONS,
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['sidePanel', 'storage', 'activeTab', 'scripting'],
  optional_host_permissions: ['http://*/*', 'https://*/*'],
  ...(env.mode === 'e2e' ? { host_permissions: E2E_HOST_PERMISSIONS } : {}),
  commands: {
    'open-side-panel': {
      suggested_key: { default: 'Alt+Shift+F' },
      description: 'Open the autofill side panel',
    },
  },
}))
