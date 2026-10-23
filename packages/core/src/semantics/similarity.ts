import { tokenize } from './normalize'

function bigrams(text: string): Map<string, number> {
  const compact = text.replace(/\s+/g, ' ')
  const grams = new Map<string, number>()
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2)
    grams.set(gram, (grams.get(gram) ?? 0) + 1)
  }
  return grams
}

/** Sørensen–Dice coefficient over character bigrams (0..1). */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0
  if (a.length < 2 || b.length < 2) return 0
  const left = bigrams(a)
  const right = bigrams(b)
  let overlap = 0
  for (const [gram, count] of left) {
    overlap += Math.min(count, right.get(gram) ?? 0)
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1))
}

/** Jaccard similarity over word tokens (0..1). */
export function tokenJaccard(a: string, b: string): number {
  const left = new Set(tokenize(a))
  const right = new Set(tokenize(b))
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

/**
 * Similarity between two normalized labels. Combines character and token overlap so that
 * "expected salary" ~ "salary expectation" scores well while unrelated labels stay low.
 * A high score is a hint, never proof of semantic equivalence.
 */
export function labelSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  return 0.6 * diceCoefficient(a, b) + 0.4 * tokenJaccard(a, b)
}

/** True when every token of `phrase` appears in `text` as whole words, in order. */
export function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false
  return ` ${text} `.includes(` ${phrase} `)
}
