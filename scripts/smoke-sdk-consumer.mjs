// Installs release/sdk into a throwaway consumer project the way a host would (copied into
// node_modules, React and @types supplied by the consumer) and checks that:
//   1. every subpath typechecks under strict settings with skipLibCheck off,
//   2. the real `chrome` global is accepted by createExtensionAutofillHost,
//   3. every subpath imports at runtime with only the peer dependencies present,
//   4. the ufa-assets bin copies the runtime assets.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(repoRoot, 'release/sdk')
const consumerDir = join(repoRoot, '.tmp/sdk-consumer')
const modulesDir = join(consumerDir, 'node_modules')

if (!existsSync(join(releaseDir, 'package.json'))) {
  console.error('release/sdk is missing; run `pnpm build:package` first.')
  process.exit(1)
}

rmSync(consumerDir, { recursive: true, force: true })
mkdirSync(join(modulesDir, '@universal-form-autofill'), { recursive: true })
mkdirSync(join(modulesDir, '@types'), { recursive: true })
cpSync(releaseDir, join(modulesDir, '@universal-form-autofill/sdk'), { recursive: true })

const fromSdkSource = createRequire(join(repoRoot, 'packages/public-sdk/package.json'))
const fromRoot = createRequire(join(repoRoot, 'package.json'))
const consumerDeps = [
  ['react', fromSdkSource],
  ['react-dom', fromSdkSource],
  ['@types/react', fromSdkSource],
  ['@types/react-dom', fromSdkSource],
  ['@types/chrome', fromRoot],
]
for (const [name, require] of consumerDeps) {
  const source = dirname(require.resolve(`${name}/package.json`))
  symlinkSync(source, join(modulesDir, name), 'junction')
}

writeFileSync(
  join(consumerDir, 'package.json'),
  JSON.stringify({ name: 'sdk-consumer', private: true, type: 'module' }, null, 2),
)
writeFileSync(
  join(consumerDir, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        verbatimModuleSyntax: true,
        skipLibCheck: false,
        noEmit: true,
        types: ['chrome'],
      },
      include: ['consumer.tsx'],
    },
    null,
    2,
  ),
)
writeFileSync(
  join(consumerDir, 'consumer.tsx'),
  `import '@universal-form-autofill/sdk/style.css'
import {
  AUTOFILL_MODES,
  createAutofill,
  createDomPageDriver,
  createMemoryStorage,
  isAutofillError,
  SDK_VERSION,
  type AutofillController,
  type AutofillMode,
  type FieldDescriptor,
  type PageInfo,
} from '@universal-form-autofill/sdk'
import { installExtensionContentRuntime } from '@universal-form-autofill/sdk/content'
import {
  CONTENT_SCRIPT_FILE_NAME,
  createExtensionAutofillHost,
  type ExtensionAutofillHost,
} from '@universal-form-autofill/sdk/extension'
import {
  AutofillPanel,
  AutofillRoot,
  cssVariableTheme,
  useAutofillState,
  type AutofillTheme,
} from '@universal-form-autofill/sdk/react'

const host: ExtensionAutofillHost = createExtensionAutofillHost({
  chrome,
  contentScriptFile: \`form-autofill/\${CONTENT_SCRIPT_FILE_NAME}\`,
  storageNamespace: 'consumer_autofill',
})
const theme: AutofillTheme = cssVariableTheme()

export function Panel() {
  return <AutofillPanel host={host} theme={theme} embedded />
}

export function Status({ controller }: { controller: AutofillController | null }) {
  const state = useAutofillState(controller)
  return <AutofillRoot theme={theme}>{state.status}</AutofillRoot>
}

export const mode: AutofillMode = AUTOFILL_MODES[0]
export const version: string = SDK_VERSION
export type Label = FieldDescriptor['label']
export type Url = PageInfo['url']
export const api = [createAutofill, createDomPageDriver, createMemoryStorage, isAutofillError, installExtensionContentRuntime]
`,
)
writeFileSync(
  join(consumerDir, 'runtime-check.mjs'),
  `const expected = {
  '@universal-form-autofill/sdk': ['createAutofill', 'createDomPageDriver', 'createMemoryStorage', 'SDK_VERSION', 'AutofillError'],
  '@universal-form-autofill/sdk/react': ['AutofillPanel', 'AutofillRoot', 'cssVariableTheme', 'useAutofillController'],
  '@universal-form-autofill/sdk/extension': ['createExtensionAutofillHost', 'CONTENT_SCRIPT_FILE_NAME'],
  '@universal-form-autofill/sdk/content': ['installAutofillContentRuntime', 'installExtensionContentRuntime'],
}
for (const [specifier, names] of Object.entries(expected)) {
  const module = await import(specifier)
  const missing = names.filter((name) => module[name] === undefined)
  if (missing.length) throw new Error(\`\${specifier} is missing \${missing.join(', ')}\`)
}
console.log('runtime imports ok')
`,
)

const tsc = fromRoot.resolve('typescript/bin/tsc')
const run = (args, label) => {
  try {
    execFileSync(process.execPath, args, { cwd: consumerDir, stdio: 'inherit' })
    console.log(`ok   ${label}`)
  } catch {
    console.error(`FAIL ${label}`)
    process.exit(1)
  }
}

run([tsc, '-p', 'tsconfig.json'], 'consumer typecheck (strict, skipLibCheck off)')
run(['runtime-check.mjs'], 'runtime import of every subpath')
run(
  [
    join(modulesDir, '@universal-form-autofill/sdk/bin/ufa-assets.mjs'),
    'public/form-autofill',
    '--css',
  ],
  'ufa-assets bin',
)
for (const file of ['content-script.js', 'style.css']) {
  if (!existsSync(join(consumerDir, 'public/form-autofill', file))) {
    console.error(`FAIL ufa-assets did not copy ${file}`)
    process.exit(1)
  }
}
console.log('SDK consumer smoke test passed')
