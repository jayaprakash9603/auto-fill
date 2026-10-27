#!/usr/bin/env node
// Builds the installable package into <repo>/release/sdk: bundled ESM + declarations per subpath, the
// scoped stylesheet, the injectable page runtime and the asset CLI. Every internal package and
// third-party library is bundled, so the generated package.json has no runtime dependencies and npm
// hosts can link it with `file:` without resolving pnpm workspace protocols.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import * as nodeModule from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createLoad } from './yuku-wasm-core.mjs'

// Registered before tsdown loads, so its declaration bundler parses with Yuku's WebAssembly core.
const wasm = {
  entry: import.meta.resolve('@yuku-core/wasm'),
  binary: import.meta.resolve('@yuku-core/wasm/yuku-core.wasm'),
  version: JSON.parse(
    readFileSync(new URL(import.meta.resolve('@yuku-core/wasm/package.json')), 'utf8'),
  ).version,
}
if (nodeModule.registerHooks) nodeModule.registerHooks({ load: createLoad(wasm) })
else nodeModule.register('./yuku-wasm-core.mjs', import.meta.url, { data: wasm })

const { build } = await import('tsdown')

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../..')
const releaseDir = resolve(repoRoot, 'release/sdk')
const distDir = join(releaseDir, 'dist')

const { buildCss } = await import(
  pathToFileURL(resolve(repoRoot, 'packages/ui/scripts/build-css.mjs')).href
)
const { buildContentRuntime } = await import(
  pathToFileURL(resolve(repoRoot, 'scripts/build-content-runtime.mjs')).href
)

const ENTRIES = ['index', 'react', 'extension', 'content']
const PEERS = ['react', 'react-dom']
const isPeer = (id) => PEERS.some((peer) => id === peer || id.startsWith(`${peer}/`))
const isWorkspace = (id) =>
  id.startsWith('@ufa/') || id.startsWith('.') || /^[a-zA-Z]:[\\/]|^\//.test(id)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const MODULE_SPECIFIER_PATTERNS = [
  /^\s*(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/gm,
  /^\s*import\s*(['"])([^'"\n]+)\1/gm,
  /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
]

/** Fails the build if emitted code or types still reference workspace-only or third-party packages. */
function assertSelfContained() {
  const offenders = []
  for (const file of walk(distDir)) {
    const text = readFileSync(file, 'utf8')
    const specifiers = MODULE_SPECIFIER_PATTERNS.flatMap((pattern) =>
      [...text.matchAll(pattern)].map((match) => match[2]),
    )
    for (const specifier of specifiers) {
      if (specifier.startsWith('.') || isPeer(specifier)) continue
      offenders.push(`${relative(releaseDir, file)} -> ${specifier}`)
    }
  }
  if (offenders.length)
    throw new Error(`release/sdk is not self-contained:\n  ${offenders.join('\n  ')}`)
}

function writePackageJson() {
  const source = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const subpath = (entry) => ({
    types: `./dist/${entry}.d.mts`,
    import: `./dist/${entry}.mjs`,
    default: `./dist/${entry}.mjs`,
  })
  const manifest = {
    name: source.name,
    version: source.version,
    description: source.description,
    repository: {
      type: 'git',
      url: 'git+https://github.com/jayaprakash9603/auto-fill.git',
      directory: 'packages/public-sdk',
    },
    homepage: 'https://github.com/jayaprakash9603/auto-fill#readme',
    bugs: { url: 'https://github.com/jayaprakash9603/auto-fill/issues' },
    // Scoped packages publish as private unless told otherwise.
    publishConfig: { access: 'public' },
    type: 'module',
    sideEffects: ['*.css', './content-script.js'],
    exports: {
      '.': subpath('index'),
      './react': subpath('react'),
      './extension': subpath('extension'),
      './content': subpath('content'),
      // `types` lets TypeScript resolve `import '.../style.css'`, which TS 6 checks by default.
      './style.css': { types: './style.css.d.ts', style: './style.css', default: './style.css' },
      './content-script.js': './content-script.js',
      './package.json': './package.json',
    },
    types: './dist/index.d.mts',
    bin: { 'ufa-assets': './bin/ufa-assets.mjs' },
    files: ['dist', 'bin', 'style.css', 'style.css.d.ts', 'content-script.js', 'README.md'],
    peerDependencies: source.peerDependencies,
    peerDependenciesMeta: { react: { optional: true }, 'react-dom': { optional: true } },
    engines: { node: '>=20.19' },
  }
  writeFileSync(join(releaseDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

rmSync(releaseDir, { recursive: true, force: true })
mkdirSync(releaseDir, { recursive: true })

await build({
  config: false,
  cwd: packageRoot,
  entry: Object.fromEntries(
    ENTRIES.map((entry) => [entry, resolve(packageRoot, `src/${entry}.ts`)]),
  ),
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outDir: distDir,
  clean: false,
  hash: false,
  minify: false,
  sourcemap: false,
  // Bare imports of external packages are dropped (they only exist for declarations); bundled modules keep
  // their package.json `sideEffects` hints so tree-shaking still works.
  treeshake: { moduleSideEffects: (_id, external) => (external ? false : undefined) },
  report: false,
  logLevel: 'warn',
  // Declarations are only emitted for files the program includes, so every bundled package is listed there.
  tsconfig: resolve(packageRoot, 'tsconfig.build.json'),
  // Eager mode type-checks the whole program up front, which declarations crossing package boundaries need.
  dts: { resolver: 'tsc', tsc: { eager: true } },
  fixedExtension: true,
  deps: {
    neverBundle: (id) => isPeer(id),
    alwaysBundle: (id) => !isPeer(id),
    onlyBundle: false,
    onlyImport: PEERS,
    // Declarations inline only workspace packages. Third-party imports stay external so tree-shaking can drop
    // them; assertSelfContained() then fails the build if a public type still reaches one.
    dts: { neverBundle: (id) => !isWorkspace(id), alwaysBundle: (id) => isWorkspace(id) },
  },
})

buildCss(join(releaseDir, 'style.css'))
writeFileSync(join(releaseDir, 'style.css.d.ts'), 'export {}\n')
await buildContentRuntime(join(releaseDir, 'content-script.js'))
cpSync(resolve(packageRoot, 'bin'), join(releaseDir, 'bin'), { recursive: true })
if (existsSync(resolve(packageRoot, 'README.md')))
  cpSync(resolve(packageRoot, 'README.md'), join(releaseDir, 'README.md'))
writePackageJson()
assertSelfContained()

const size = (file) => `${(statSync(file).size / 1024).toFixed(1)} KiB`
console.log(`@universal-form-autofill/sdk -> ${relative(repoRoot, releaseDir)}`)
for (const file of walk(releaseDir).sort())
  console.log(`  ${relative(releaseDir, file).padEnd(36)} ${size(file)}`)
