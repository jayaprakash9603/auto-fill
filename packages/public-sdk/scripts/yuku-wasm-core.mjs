// Module hook that hands Yuku, the parser rolldown-plugin-dts bundles declarations with, its WebAssembly
// core instead of the native binary: application control policies such as Windows Smart App Control can
// block that unsigned binary, and the WebAssembly core runs anywhere.
import { readFileSync } from 'node:fs'

const CORE_ENTRY = /\/node_modules\/yuku-core\/index\.js$/

/** `wasm` holds the file URLs of @yuku-core/wasm's Node entry and binary, and the package version. */
export function createLoad(wasm) {
  return function load(url, context, nextLoad) {
    if (!CORE_ENTRY.test(url)) return nextLoad(url, context)
    const { version } = JSON.parse(readFileSync(new URL('./package.json', url), 'utf8'))
    if (version !== wasm.version)
      throw new Error(
        `@yuku-core/wasm ${wasm.version} does not match yuku-core ${version}; pin the same version in packages/public-sdk/package.json`,
      )
    return {
      format: 'module',
      shortCircuit: true,
      source: [
        `import { readFileSync } from 'node:fs'`,
        `import { loadSync } from ${JSON.stringify(wasm.entry)}`,
        `export { fileOptions, langFromPath, sourceTypeFromPath } from './options.js'`,
        `let core`,
        `export function load() {`,
        `  return (core ??= loadSync(readFileSync(new URL(${JSON.stringify(wasm.binary)}))))`,
        `}`,
      ].join('\n'),
    }
  }
}

// Entry points for module.register(), which runs hooks off-thread on Node versions without registerHooks().
let registered
export function initialize(wasm) {
  registered = createLoad(wasm)
}
export function load(url, context, nextLoad) {
  return registered(url, context, nextLoad)
}
