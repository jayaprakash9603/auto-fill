#!/usr/bin/env node
// Copies the prebuilt page runtime (and optionally the stylesheet) into a host extension's static
// folder, e.g. `ufa-assets public/form-autofill`. The host then passes
// `form-autofill/content-script.js` as `contentScriptFile`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const withCss = args.includes('--css')
const target = args.find((arg) => !arg.startsWith('-'))

if (!target || args.includes('--help') || args.includes('-h')) {
  console.log(
    'Usage: ufa-assets <out-dir> [--css]\n\nCopies content-script.js (and style.css with --css) into <out-dir>.',
  )
  process.exit(target ? 0 : 1)
}

const outDir = resolve(process.cwd(), target)
mkdirSync(outDir, { recursive: true })
const files = ['content-script.js', ...(withCss ? ['style.css'] : [])]
for (const file of files) {
  const source = join(packageRoot, file)
  if (!existsSync(source)) {
    console.error(`ufa-assets: missing ${source}; rebuild @universal-form-autofill/sdk`)
    process.exit(1)
  }
  copyFileSync(source, join(outDir, file))
}
console.log(`ufa-assets: copied ${files.join(', ')} to ${outDir}`)
