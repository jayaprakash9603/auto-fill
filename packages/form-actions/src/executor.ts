import {
  clearOperationSchema,
  fieldValuesEqual,
  fillOperationSchema,
  isFieldValueEmpty,
  toAutofillError,
  type ControlOutcome,
  type ControlTarget,
  type FieldDescriptor,
  type FieldValue,
  type FillOperation,
  type FillOperationInput,
  type ClearOperation,
  type ClearOperationInput,
  type ClearResult,
  type FillResult,
  type RestoreResult,
} from '@ufa/core'

import { clearRefusalReason, emptyValueFor } from './clear'
import { DEFAULT_OPTION_TIMEOUT_MS, fillControl, type ControlFillOptions } from './controls'
import { readControlValue, valueMatches } from './read'

export interface FormActionsOptions {
  /**
   * Finds the live control for a field and describes it afresh. Throws FIELD_NOT_FOUND when it is
   * gone and FIELD_CHANGED when its fingerprint no longer matches.
   */
  resolve(fieldId: string, fingerprint?: string): ControlTarget
  /** Replaces the generic control adapters for some fields; return null to use the generic ones. */
  fillField?: (target: ControlTarget, value: FieldValue) => Promise<ControlOutcome | null>
  optionTimeoutMs?: number
  /** Undo snapshots kept in memory; the oldest is dropped first. */
  maxSnapshots?: number
}

export interface FormActions {
  fill(operations: readonly FillOperationInput[], signal?: AbortSignal): Promise<FillResult[]>
  clear(operations: readonly ClearOperationInput[], signal?: AbortSignal): Promise<ClearResult[]>
  restore(snapshotId: string, signal?: AbortSignal): Promise<RestoreResult[]>
}

interface SnapshotEntry {
  fieldId: string
  fingerprint: string
  previous: FieldValue | null
  filled: FieldValue | null
}

/**
 * Why a field must not be filled, judged on the live control. These rules repeat the policy
 * checks on purpose: the page is the last line of defence against stale or forged requests.
 */
export function refusalReason(field: FieldDescriptor, operation: FillOperation): string | null {
  if (field.sensitivity === 'prohibited')
    return `Protected field (${field.sensitivityReason ?? 'sensitive'}): never filled.`
  if (field.support === 'unsupported')
    return field.unsupportedReason ?? 'This control is not supported.'
  if (field.type === 'file') return 'Files are never uploaded automatically.'
  if (!field.visible) return 'The field is hidden.'
  if (!field.editable) return 'The field cannot be edited.'
  if (field.sensitivity === 'consent') {
    if (operation.source === 'generated') return 'Consent fields never receive generated values.'
    if (!operation.explicitlySelected)
      return 'Consent fields change only when you select them yourself.'
  }
  return null
}

let snapshotCounter = 0

/** Fills, verifies and restores fields of one document. Runs where the document lives. */
export function createFormActions(options: FormActionsOptions): FormActions {
  const controlOptions: ControlFillOptions = {
    optionTimeoutMs: options.optionTimeoutMs ?? DEFAULT_OPTION_TIMEOUT_MS,
  }
  const maxSnapshots = options.maxSnapshots ?? 20
  const snapshots = new Map<string, SnapshotEntry[]>()

  const write = async (target: ControlTarget, value: FieldValue): Promise<ControlOutcome> => {
    try {
      return (
        (await options.fillField?.(target, value)) ??
        (await fillControl(target, value, controlOptions))
      )
    } catch (error) {
      return { ok: false, verified: false, reason: toAutofillError(error).message }
    }
  }

  const fillOne = async (
    operation: FillOperation,
    snapshotId: string,
    entries: SnapshotEntry[],
  ): Promise<FillResult> => {
    const result = (status: FillResult['status'], reason: string | null, verified = false) => ({
      fieldId: operation.fieldId,
      status,
      reason,
      verified,
      snapshotId: null,
    })
    let target: ControlTarget
    try {
      target = options.resolve(operation.fieldId, operation.fingerprint ?? undefined)
    } catch (error) {
      return result('failed', toAutofillError(error).message)
    }
    const { field } = target
    const refusal = refusalReason(field, operation)
    if (refusal) return result('skipped', refusal)

    const previous = readControlValue(target)
    if (valueMatches(field, operation.value, previous))
      return result('unchanged', 'Already has this value.', true)
    if (!isFieldValueEmpty(previous) && !operation.allowOverwrite)
      return result('skipped', 'Already has a value; it was kept.')

    const outcome = await write(target, operation.value)
    const filled = readControlValue(target)
    const changed = !fieldValuesEqual(previous, filled)
    if (changed) entries.push({ fieldId: field.id, fingerprint: field.fingerprint, previous, filled })
    return {
      fieldId: operation.fieldId,
      status: outcome.ok ? 'filled' : 'failed',
      reason: outcome.reason,
      verified: outcome.ok && outcome.verified,
      snapshotId: changed ? snapshotId : null,
    }
  }

  const clearOne = async (
    operation: ClearOperation,
    snapshotId: string,
    entries: SnapshotEntry[],
  ): Promise<ClearResult> => {
    const result = (
      status: ClearResult['status'],
      reason: string | null,
      verified = false,
    ): ClearResult => ({
      fieldId: operation.fieldId,
      status,
      reason,
      verified,
      snapshotId: null,
    })
    let target: ControlTarget
    try {
      target = options.resolve(operation.fieldId)
    } catch (error) {
      return result('failed', toAutofillError(error).message)
    }
    const { field } = target
    const refusal = clearRefusalReason(field, operation)
    if (refusal) return result('skipped', refusal)
    const empty = emptyValueFor(field)
    if (!empty) return result('skipped', 'This control cannot be cleared.')
    const previous = readControlValue(target)
    if (isFieldValueEmpty(previous)) return result('unchanged', 'Already empty.', true)
    if (operation.requireRestorable && previous === null)
      return result('skipped', 'The earlier value could not be read for undo.')
    const outcome = await write(target, empty)
    const cleared = readControlValue(target)
    const changed = !fieldValuesEqual(previous, cleared)
    if (changed) entries.push({ fieldId: field.id, fingerprint: field.fingerprint, previous, filled: cleared })
    return {
      fieldId: operation.fieldId,
      status: outcome.ok ? 'cleared' : 'failed',
      reason: outcome.reason,
      verified: outcome.ok && outcome.verified,
      snapshotId: changed ? snapshotId : null,
    }
  }

  const restoreOne = async (entry: SnapshotEntry): Promise<RestoreResult> => {
    const result = (status: RestoreResult['status'], reason: string | null): RestoreResult => ({
      fieldId: entry.fieldId,
      status,
      reason,
    })
    let target: ControlTarget
    try {
      target = options.resolve(entry.fieldId, entry.fingerprint)
    } catch (error) {
      return result('failed', toAutofillError(error).message)
    }
    if (target.field.sensitivity === 'prohibited') return result('not-restorable', null)
    if (entry.previous === null)
      return result('not-restorable', 'The earlier value could not be read.')
    if (!fieldValuesEqual(readControlValue(target), entry.filled))
      return result('not-restorable', 'Changed since it was filled; left as it is.')
    const outcome = await write(target, entry.previous)
    return outcome.ok ? result('restored', null) : result('failed', outcome.reason)
  }

  return {
    async fill(operations, signal) {
      snapshotCounter += 1
      const snapshotId = `s${Date.now().toString(36)}${snapshotCounter}`
      const entries: SnapshotEntry[] = []
      const results: FillResult[] = []
      // One field at a time: an answer can reveal, load or change the fields after it.
      for (const raw of operations) {
        const operation = fillOperationSchema.parse(raw)
        if (signal?.aborted) {
          results.push({
            fieldId: operation.fieldId,
            status: 'skipped',
            reason: 'The fill was cancelled.',
            verified: false,
            snapshotId: null,
          })
          continue
        }
        results.push(await fillOne(operation, snapshotId, entries))
      }
      if (entries.length > 0) {
        snapshots.set(snapshotId, entries)
        for (const id of snapshots.keys()) {
          if (snapshots.size <= maxSnapshots) break
          snapshots.delete(id)
        }
      }
      return results
    },
    async clear(operations, signal) {
      snapshotCounter += 1
      const snapshotId = `c${Date.now().toString(36)}${snapshotCounter}`
      const entries: SnapshotEntry[] = []
      const results: ClearResult[] = []
      for (const raw of operations) {
        const operation = clearOperationSchema.parse(raw)
        if (signal?.aborted) {
          results.push({
            fieldId: operation.fieldId,
            status: 'skipped',
            reason: 'The clear was cancelled.',
            verified: false,
            snapshotId: null,
          })
          continue
        }
        results.push(await clearOne(operation, snapshotId, entries))
      }
      if (entries.length > 0) {
        snapshots.set(snapshotId, entries)
        for (const id of snapshots.keys()) {
          if (snapshots.size <= maxSnapshots) break
          snapshots.delete(id)
        }
      }
      return results
    },
    async restore(snapshotId, signal) {
      const entries = snapshots.get(snapshotId)
      if (!entries) return []
      snapshots.delete(snapshotId)
      const results: RestoreResult[] = []
      // Newest change first, the reverse of how the fields were filled.
      for (const entry of [...entries].reverse()) {
        if (signal?.aborted) {
          results.push({ fieldId: entry.fieldId, status: 'failed', reason: 'Cancelled.' })
          continue
        }
        results.push(await restoreOne(entry))
      }
      return results.reverse()
    },
  }
}
