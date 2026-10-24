import {
  AutofillError,
  FIELD_TYPES,
  PLUGIN_API_VERSION,
  invokePlugin,
  scanRequestSchema,
  type DetectedControl,
  type DetectionContext,
  type FieldDescriptor,
  type FieldDetector,
  type ScanRequestInput,
} from '@ufa/core'

import { createContextResolver } from './context'
import { describeControl, type DescribedControl } from './describe'
import { BUILTIN_DETECTORS } from './detectors'
import { isElement, isInIgnoredRegion, legendOf } from './dom'
import { createIdentityRegistry } from './identity'
import { indexTree, positionOf } from './tree'
import { createVisibilityProbe } from './visibility'

export const MAX_FIELDS = 5_000

const KNOWN_TYPES = new Set<string>(FIELD_TYPES)

export interface FieldScannerOptions {
  document: Document
  /** Defaults to `BUILTIN_DETECTORS`; pass `[...BUILTIN_DETECTORS, mine]` to extend them. */
  detectors?: readonly FieldDetector[]
  /** Prefix for field ids; random by default so ids never collide across frames or reloads. */
  idPrefix?: string
  /** Called when a detector throws or returns malformed controls; the scan continues without it. */
  onPluginError?: (pluginId: string, error: unknown) => void
}

/** A field together with the live elements it was described from. */
export interface ScannedField {
  field: FieldDescriptor
  element: Element
  members: readonly Element[]
}

export interface FieldScanner {
  /** Detects and describes every form control in the document and its open shadow roots. */
  scan(request?: ScanRequestInput): FieldDescriptor[]
  /** Like `scan`, but keeps the live elements, for actions that operate on them. */
  scanTargets(request?: ScanRequestInput): ScannedField[]
  /**
   * Re-finds a field by id. Throws FIELD_NOT_FOUND when it is gone, and FIELD_CHANGED when the
   * control at that id no longer matches `expectedFingerprint`.
   */
  resolve(fieldId: string, expectedFingerprint?: string): ScannedField
  /** Open shadow roots found by the last scan; observers watch them too. */
  readonly shadowRoots: readonly ShadowRoot[]
}

function isValidControl(control: unknown): control is DetectedControl {
  if (typeof control !== 'object' || control === null) return false
  const candidate = control as Partial<DetectedControl>
  return (
    typeof candidate.kind === 'string' &&
    KNOWN_TYPES.has(candidate.kind) &&
    isElement(candidate.element) &&
    (candidate.members === undefined ||
      (Array.isArray(candidate.members) && candidate.members.every(isElement)))
  )
}

function sortDetectors(detectors: readonly FieldDetector[]): FieldDetector[] {
  return [...detectors].sort(
    (a, b) => (a.order ?? 1_000) - (b.order ?? 1_000) || a.id.localeCompare(b.id),
  )
}

export function createFieldScanner(options: FieldScannerOptions): FieldScanner {
  const doc = options.document
  const detectors = sortDetectors(options.detectors ?? BUILTIN_DETECTORS)
  const identity = createIdentityRegistry(options.idPrefix)
  const reportError = options.onPluginError ?? (() => undefined)
  let shadowRoots: ShadowRoot[] = []

  const detect = (roots: readonly ParentNode[]) => {
    const claimed = new Set<Element>()
    const context: DetectionContext = {
      document: doc,
      isClaimed: (element) => claimed.has(element),
    }
    const found: Array<{ control: DetectedControl; detectorId: string }> = []
    for (const detector of detectors) {
      if (detector.apiVersion !== PLUGIN_API_VERSION) {
        reportError(detector.id, new Error(`Unsupported plugin API version ${detector.apiVersion}`))
        continue
      }
      for (const root of roots) {
        const controls = invokePlugin(
          detector.id,
          () => detector.detect(root, context),
          reportError,
        )
        if (!Array.isArray(controls)) continue
        for (const control of controls) {
          if (!isValidControl(control)) {
            reportError(detector.id, new Error('Detector returned a malformed control.'))
            continue
          }
          const elements = [control.element, ...(control.members ?? [])]
          if (elements.some((element) => claimed.has(element) || isInIgnoredRegion(element)))
            continue
          elements.forEach((element) => claimed.add(element))
          found.push({ control, detectorId: detector.id })
        }
      }
    }
    return found
  }

  const scanTargets = (request?: ScanRequestInput): ScannedField[] => {
    const { includeHidden, includeDisabled } = scanRequestSchema.parse(request ?? {})
    const index = indexTree(doc)
    shadowRoots = index.shadowRoots
    const found = detect([doc, ...index.shadowRoots])

    const fieldsetCounts = new Map<Element, number>()
    for (const { control } of found) {
      const fieldset = (control.members?.[0] ?? control.element).parentElement?.closest('fieldset')
      if (fieldset) fieldsetCounts.set(fieldset, (fieldsetCounts.get(fieldset) ?? 0) + 1)
    }
    const env = {
      isVisible: createVisibilityProbe(doc),
      context: createContextResolver(index),
      soleFieldsetLegend: (element: Element) => {
        const fieldset = element.parentElement?.closest('fieldset')
        if (!fieldset || fieldsetCounts.get(fieldset) !== 1) return null
        return legendOf(fieldset)
      },
    }

    const described: DescribedControl[] = []
    for (const { control, detectorId } of found) {
      const result = invokePlugin(
        detectorId,
        () => describeControl(control, detectorId, env),
        reportError,
      )
      if (!result) continue
      if (!includeHidden && !result.field.visible) continue
      if (!includeDisabled && !result.field.editable) continue
      described.push(result)
    }
    described.sort((a, b) => positionOf(index, a.anchor) - positionOf(index, b.anchor))

    const targets = described.slice(0, MAX_FIELDS).map((entry, order): ScannedField => ({
      field: { ...entry.field, id: identity.assign(entry.anchor, entry.field.fingerprint), order },
      element: entry.element,
      members: entry.members,
    }))
    identity.prune()
    return targets
  }

  return {
    scan: (request) => scanTargets(request).map((target) => target.field),
    scanTargets,
    resolve(fieldId, expectedFingerprint) {
      const target = scanTargets({ includeHidden: true, includeDisabled: true }).find(
        (entry) => entry.field.id === fieldId,
      )
      if (!target) throw new AutofillError('FIELD_NOT_FOUND', 'The field is no longer on the page.')
      if (expectedFingerprint !== undefined && target.field.fingerprint !== expectedFingerprint) {
        throw new AutofillError('FIELD_CHANGED', 'The field changed since it was scanned.')
      }
      return target
    },
    get shadowRoots() {
      return shadowRoots
    },
  }
}
