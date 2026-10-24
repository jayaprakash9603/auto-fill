#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectPublicApiReport } from './collect-public-api.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = join(repoRoot, 'scripts/public-api.snapshot.json')

const expected = JSON.parse(readFileSync(snapshotPath, 'utf8'))
const actual = collectPublicApiReport()

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(
    'Public SDK exports changed. Run `node scripts/collect-public-api.mjs` and commit scripts/public-api.snapshot.json if intentional.',
  )
  process.exit(1)
}
console.log('Public API snapshot is up to date.')
