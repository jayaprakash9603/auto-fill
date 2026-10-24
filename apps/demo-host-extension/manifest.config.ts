import { defineManifest } from '@crxjs/vite-plugin'

import pkg from './package.json' with { type: 'json' }

const ICONS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

export default defineManifest(() => ({
  manifest_version: 3,
  name: 'UFA SDK Demo Host',
  description: 'Minimal extension that embeds only @universal-form-autofill/sdk.',
  version: pkg.version,
  icons: ICONS,
  action: { default_title: 'UFA SDK Demo', default_popup: 'src/popup/index.html', default_icon: ICONS },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['sidePanel', 'storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
}))
