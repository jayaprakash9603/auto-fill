import type { FieldDetector } from '@ufa/core'

import { ariaWidgetsDetector } from './aria'
import { contentEditableDetector } from './contenteditable'
import { nativeControlsDetector } from './native'

export { ariaWidgetsDetector, contentEditableDetector, nativeControlsDetector }
export { UNSUPPORTED_REASONS } from './native'

/** Generic detectors, in execution order. Portal adapters run their detectors before these. */
export const BUILTIN_DETECTORS: readonly FieldDetector[] = [
  nativeControlsDetector,
  ariaWidgetsDetector,
  contentEditableDetector,
]
