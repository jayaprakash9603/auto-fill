import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Builds the extension with the E2E manifest (local fixture host access) unless told to reuse a build. */
export default function globalSetup(): void {
  if (process.env.UFA_E2E_SKIP_BUILD === '1') return
  execSync('pnpm --filter @ufa/chrome-extension build:e2e', {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    stdio: 'inherit',
  })
}
