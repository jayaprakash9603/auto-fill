import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

import manifest from './manifest.config.ts'

/** Vite marks built scripts as CORS. Chrome then refuses to run them and the side panel stays blank. */
function stripCrossOrigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replaceAll(/\s+crossorigin(?:="[^"]*")?/g, '')
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest }), stripCrossOrigin()],
  build: {
    emptyOutDir: true,
    modulePreload: false,
    target: 'chrome116',
  },
  server: {
    port: 5199,
    strictPort: true,
    hmr: { port: 5199 },
  },
})
