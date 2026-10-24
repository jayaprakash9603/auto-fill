import {
  isFieldValueEmpty,
  type AnswerValue,
  type FieldDescriptor,
  type FieldValue,
  type LearningCandidate,
  type MatchResult,
} from '@ufa/core'

import { fieldValueToAnswerValue } from './convert'

const LEARNABLE_MATCH_STATES = new Set<MatchResult['state']>([
  'missing',
  'incompatible',
  'ambiguous',
  'skipped',
])

export function shouldCaptureLearning(input: {
  field: FieldDescriptor
  match: MatchResult | undefined
  value: FieldValue
  learningAllowed: boolean
}): string | null {
  if (!input.learningAllowed) return 'Learning is turned off in settings.'
  if (input.field.sensitivity !== 'normal') return 'This field is protected.'
  if (input.field.support !== 'supported') return 'This control is not supported.'
  if (isFieldValueEmpty(input.value)) return 'The field is empty.'
  const match = input.match
  if (match?.state === 'matched') return 'This field already has a saved answer.'
  if (match && !LEARNABLE_MATCH_STATES.has(match.state))
    return 'This field already has a proposed answer.'
  if (!fieldValueToAnswerValue(input.field, input.value)) return 'This value cannot be saved.'
  return null
}

export function learningCandidateId(site: string, field: FieldDescriptor): string {
  return `${site}|${field.normalizedLabel}|${field.type}`.slice(0, 100)
}

export function buildLearningCandidate(input: {
  site: string
  field: FieldDescriptor
  value: AnswerValue
  capturedAt: number
  duplicateOfAnswerId: string | null
}): LearningCandidate {
  return {
    id: learningCandidateId(input.site, input.field),
    site: input.site,
    field: {
      label: input.field.label,
      normalizedLabel: input.field.normalizedLabel,
      type: input.field.type,
      section: input.field.section,
      formTitle: input.field.formTitle,
      options: input.field.options,
      semanticKey: input.field.semanticKey,
    },
    value: input.value,
    capturedAt: input.capturedAt,
    status: 'pending',
    duplicateOfAnswerId: input.duplicateOfAnswerId,
  }
}
