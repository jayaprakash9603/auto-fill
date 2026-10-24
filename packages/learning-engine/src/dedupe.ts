import {
  normalizeLabel,
  type AnswerRecord,
  type AnswerValue,
  type FieldDescriptor,
} from '@ufa/core'

function valuesEqual(a: AnswerValue, b: AnswerValue): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'text':
      return a.text.trim().toLowerCase() === (b as typeof a).text.trim().toLowerCase()
    case 'boolean':
      return a.value === (b as typeof a).value
    case 'list': {
      const other = (b as typeof a).items.map((item) => item.toLowerCase()).sort()
      return (
        a.items.length === other.length &&
        [...a.items]
          .map((item) => item.toLowerCase())
          .sort()
          .join('\0') === other.join('\0')
      )
    }
  }
}

/** An existing answer that already covers this field and value, if any. */
export function findDuplicateAnswerId(
  field: FieldDescriptor,
  value: AnswerValue,
  answers: readonly AnswerRecord[],
): string | null {
  const label = normalizeLabel(field.label)
  for (const answer of answers) {
    const labels = new Set([
      normalizeLabel(answer.label),
      ...answer.aliases.map((alias) => alias.normalized),
    ])
    if (!labels.has(label) && normalizeLabel(answer.label) !== field.normalizedLabel) continue
    if (valuesEqual(answer.value, value)) return answer.id
  }
  return null
}
