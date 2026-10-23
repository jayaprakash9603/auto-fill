#!/usr/bin/env node
// Compiles the scoped stylesheet and removes the last global footprint Tailwind leaves behind:
// its internal `--tw-*` properties (registered page-wide with @property) become `--ufa-tw-*`, and the
// fallback block for browsers without @property is limited to `.ufa-root` subtrees.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GLOBAL_FALLBACK_SELECTOR = /\*,\s*::?before,\s*::?after,\s*::backdrop\s*\{/g
const SCOPED_FALLBACK_SELECTOR =
  ':where(.ufa-root), :where(.ufa-root) *, :where(.ufa-root) ::before, :where(.ufa-root) ::after, :where(.ufa-root) ::backdrop {'

export function scopeTailwindOutput(css) {
  return css
    .replaceAll('--tw-', '--ufa-tw-')
    .replace(GLOBAL_FALLBACK_SELECTOR, SCOPED_FALLBACK_SELECTOR)
}

function resolveTailwindCli() {
  const cliRoot = resolve(packageRoot, 'node_modules/@tailwindcss/cli')
  const manifest = JSON.parse(readFileSync(resolve(cliRoot, 'package.json'), 'utf8'))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.tailwindcss
  if (!bin) throw new Error('@tailwindcss/cli does not declare a tailwindcss binary')
  return resolve(cliRoot, bin)
}

export function buildCss(outFile, { minify = true } = {}) {
  const cli = resolveTailwindCli()
  const temporary = `${outFile}.raw.css`
  mkdirSync(dirname(outFile), { recursive: true })
  execFileSync(
    process.execPath,
    [
      cli,
      '-i',
      resolve(packageRoot, 'src/styles/ufa.css'),
      '-o',
      temporary,
      ...(minify ? ['--minify'] : []),
    ],
    {
      cwd: packageRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  )
  const css = scopeTailwindOutput(readFileSync(temporary, 'utf8'))
  rmSync(temporary)
  writeFileSync(outFile, css)
  return css
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const outFile = resolve(process.cwd(), process.argv[2] ?? 'dist/ufa.css')
  const css = buildCss(outFile, { minify: !process.argv.includes('--no-minify') })
  console.log(`ufa css: ${outFile} (${(css.length / 1024).toFixed(1)} KiB)`)
}
