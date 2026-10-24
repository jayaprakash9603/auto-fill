#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function bundle(entry) {
  const result = await build({
    entryPoints: [join(repoRoot, entry)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
    external: ['react', 'react-dom'],
  })
  return result.outputFiles[0]?.text ?? ''
}

const headless = await bundle('packages/public-sdk/src/index.ts')
if (headless.includes('AutofillPanel') || headless.includes('AutofillRoot')) {
  console.error('Headless SDK entry unexpectedly bundles React panel code.')
  process.exit(1)
}
if (!headless.includes('createAutofill')) {
  console.error('Headless SDK entry is missing createAutofill.')
  process.exit(1)
}

const react = await bundle('packages/public-sdk/src/react.ts')
if (!react.includes('AutofillPanel')) {
  console.error('React SDK entry is missing AutofillPanel.')
  process.exit(1)
}

console.log('Tree-shaking checks passed.')
