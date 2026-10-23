// @vitest-environment node
import type { ManifestV3Export } from '@crxjs/vite-plugin'
import { describe, expect, it } from 'vitest'

import manifestFactory from '../manifest.config.ts'

type ManifestFn = (env: {
  mode: string
  command: 'build' | 'serve'
}) => ManifestV3Export | Promise<ManifestV3Export>

async function manifestFor(mode: string) {
  const resolved = await (manifestFactory as unknown as ManifestFn)({ mode, command: 'build' })
  return resolved as chrome.runtime.ManifestV3
}

describe('extension manifest', () => {
  it('requests the minimum permissions and no host access by default', async () => {
    const manifest = await manifestFor('production')
    expect([...(manifest.permissions ?? [])].sort()).toEqual([
      'activeTab',
      'scripting',
      'sidePanel',
      'storage',
    ])
    expect(manifest.host_permissions).toBeUndefined()
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*'])
    expect(manifest.content_scripts).toBeUndefined()
    expect(manifest.web_accessible_resources).toBeUndefined()
  })

  it('adds local fixture access only to the e2e build', async () => {
    const manifest = await manifestFor('e2e')
    expect(manifest.host_permissions).toEqual(['http://127.0.0.1/*', 'http://localhost/*'])
  })
})
