#!/usr/bin/env node
// Bundles the injectable page runtime into one self-contained IIFE. The extension injects it on
// demand with chrome.scripting.executeScript; it has no imports and no globals besides its install key.
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build } from 'tsdown'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = resolve(repoRoot, 'packages/extension-bridge/src/content-main.ts')

export async function buildContentRuntime(outFile) {
  const workDir = mkdtempSync(join(tmpdir(), 'ufa-content-'))
  try {
    await build({
      config: false,
      entry: { 'content-script': ENTRY },
      format: 'iife',
      platform: 'browser',
      target: 'chrome116',
      outDir: workDir,
      minify: true,
      dts: false,
      clean: false,
      hash: false,
      treeshake: true,
      report: false,
      logLevel: 'warn',
      tsconfig: resolve(repoRoot, 'packages/extension-bridge/tsconfig.json'),
      deps: { alwaysBundle: [/.*/] },
    })
    const emitted = readdirSync(workDir).find((name) => name.endsWith('.js'))
    if (!emitted) throw new Error('content runtime build produced no JavaScript output')
    const code = readFileSync(join(workDir, emitted), 'utf8')
    if (/\bimport\s*\(|^\s*import\s|\bexport\s/m.test(code))
      throw new Error('content runtime must be a classic script without module syntax')
    mkdirSync(dirname(outFile), { recursive: true })
    writeFileSync(outFile, code)
    return code
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const target = process.argv[2]
  if (!target) {
    console.error('usage: build-content-runtime.mjs <out-file>')
    process.exit(1)
  }
  const outFile = resolve(process.cwd(), target)
  const code = await buildContentRuntime(outFile)
  console.log(`ufa content runtime: ${outFile} (${(code.length / 1024).toFixed(1)} KiB)`)
}
