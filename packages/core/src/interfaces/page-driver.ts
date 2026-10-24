import type {
  FillOperationInput,
  PageEvent,
  PageInfo,
  ScanRequestInput,
  ScanResult,
} from '../domain/page'
import type { FillResult, RestoreResult } from '../domain/results'

/**
 * The only way the engine touches a page. The DOM driver runs where the document lives (content
 * script, web app, tests); extension drivers proxy the same contract over messaging.
 */
export interface PageDriver {
  /** Identifies the implementation, e.g. "dom" or "extension-tab". */
  readonly kind: string
  /** Establishes a connection to the current page (injecting a runtime when needed). */
  connect(signal?: AbortSignal): Promise<PageInfo>
  /**
   * Detects the page's form fields. After the first scan the driver watches the page and emits
   * `fields-changed` whenever the structure of a frame's fields changes.
   */
  scan(request?: ScanRequestInput, signal?: AbortSignal): Promise<ScanResult>
  /**
   * Writes values into fields, one result per operation, in operation order. The page side
   * re-checks every safety rule against the live control and never submits a form. Changed
   * fields share a snapshot id that `restore` accepts.
   */
  fill(operations: readonly FillOperationInput[], signal?: AbortSignal): Promise<FillResult[]>
  /** Puts back the values a fill replaced, unless the user changed the field since. */
  restore(snapshotId: string, signal?: AbortSignal): Promise<RestoreResult[]>
  /** When armed, user edits on unmatched fields emit `field-input` events. */
  setLearningArmed(armed: boolean, signal?: AbortSignal): Promise<void>
  subscribe(listener: (event: PageEvent) => void): () => void
  dispose(): Promise<void>
}
