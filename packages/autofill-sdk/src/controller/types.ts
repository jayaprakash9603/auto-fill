import type {
  AutofillErrorCode,
  AutofillEventHandler,
  AutofillEventType,
  FieldDescriptor,
  Logger,
  MatchResult,
  PageDriver,
  PageInfo,
  PluginRegistry,
  StorageAdapter,
} from '@ufa/core'
import type { AutofillStore } from '@ufa/storage'

export type ConnectionStatus = 'idle' | 'connecting' | 'ready' | 'error' | 'destroyed'

export interface AutofillStateError {
  code: AutofillErrorCode
  message: string
  /** Hostname the error concerns, when known (for example, the site that needs permission). */
  site?: string
  /** Machine-readable refinement of `code`, e.g. "file-access" for PERMISSION_REQUIRED on file URLs. */
  reason?: string
}

export interface AutofillState {
  status: ConnectionStatus
  page: PageInfo | null
  error: AutofillStateError | null
  /**
   * Detected fields of every reachable frame, ordered by frame and then document order, with the
   * semantic key each one was recognized as.
   */
  fields: FieldDescriptor[]
  /** How each field matches the saved answers of the active profile, by field id. */
  matches: Record<string, MatchResult>
  scanning: boolean
  /** When the field list was last refreshed, by a scan or a page update. */
  scannedAt: number | null
}

export interface AutofillConfiguration {
  /** How the engine reaches the page: the DOM driver in-page, or an extension tab driver. */
  driver: PageDriver
  /** Where profiles, answers and settings persist. Supplied by the host. */
  storage: StorageAdapter
  /**
   * An existing data store over `storage` to share between controllers. When omitted, the
   * controller creates its own and disposes it on `destroy()`.
   */
  store?: AutofillStore
  /** Extra classifiers and matching strategies; the built-in ones always run. */
  registry?: PluginRegistry
  logger?: Logger
  /** Injectable clock for deterministic tests. */
  now?: () => number
}

export interface AutofillController {
  /** Profiles, answers, custom fields and settings. Usable whether or not a page is connected. */
  readonly store: AutofillStore
  getState(): AutofillState
  subscribe(listener: (state: AutofillState) => void): () => void
  on<T extends AutofillEventType>(type: T, handler: AutofillEventHandler<T>): () => void
  /**
   * Connects to the current page and scans its fields. Safe to call repeatedly; concurrent calls
   * share one attempt.
   */
  connect(): Promise<PageInfo | null>
  /** Rescans the connected page (connecting first if needed) and returns the fields. */
  scan(): Promise<FieldDescriptor[]>
  destroy(): Promise<void>
}

/**
 * What a UI needs from its environment. Extension hosts create tab-backed controllers and can
 * request page access; in-page hosts create DOM-backed controllers.
 */
export interface AutofillHost {
  createController(): AutofillController
  /** Asks the browser for access to the current site, from a user gesture. Optional. */
  requestPageAccess?(): Promise<boolean>
}
