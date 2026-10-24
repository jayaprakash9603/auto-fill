import type { GeneratorContext } from '@ufa/core'

/** 32-bit mulberry32; `seed` string is hashed to a uint32. */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return (h >>> 0) || 1
}

export function createGeneratorContext(
  seed: string | null,
  now: () => number = Date.now,
): GeneratorContext {
  const sequences = new Map<string, number>()
  let state = seed ? hashSeed(seed) : (now() >>> 0) || 1
  return {
    seed,
    now,
    random() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    sequence(key: string) {
      const next = (sequences.get(key) ?? 0) + 1
      sequences.set(key, next)
      return next
    },
  }
}
