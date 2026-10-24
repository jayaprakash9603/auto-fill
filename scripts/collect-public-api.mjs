#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entries = ['index', 'react', 'extension', 'content']

export function collectPublicApiReport() {
  const report = {}
  for (const entry of entries) {
    const text = readFileSync(join(repoRoot, 'packages/public-sdk/src', `${entry}.ts`), 'utf8')
    const names = new Set()
    for (const block of text.matchAll(/export\s*\{([^}]+)\}/gs)) {
      for (const part of block[1].split(',')) {
        const trimmed = part.trim()
        if (!trimmed || trimmed.startsWith('//')) continue
        const alias = trimmed.split(/\s+as\s+/i)
        const name = (alias[1] ?? alias[0]).trim()
        if (name) names.add(name.replace(/^type\s+/, ''))
      }
    }
    for (const match of text.matchAll(/export\s+type\s+\{([^}]+)\}/gs)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/i).pop()?.trim()
        if (name) names.add(name)
      }
    }
    for (const match of text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(match[1])
    for (const match of text.matchAll(/export\s+const\s+(\w+)/g)) names.add(match[1])
    report[entry] = [...names].sort()
  }
  return report
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMain) {
  const outFile = join(repoRoot, 'scripts/public-api.snapshot.json')
  writeFileSync(outFile, `${JSON.stringify(collectPublicApiReport(), null, 2)}\n`)
  console.log(`Wrote ${outFile}`)
}
