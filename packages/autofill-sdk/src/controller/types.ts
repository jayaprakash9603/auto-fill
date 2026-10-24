import type {
  AutofillErrorCode,
  AutofillEventHandler,
  AutofillEventType,
  FieldDescriptor,
  FillResult,
  LearningCandidate,
  Logger,
  MatchResult,
  PageDriver,
  PageInfo,
  PluginRegistry,
  PolicyDecision,
  RestoreResult,
  StorageAdapter,
} from '@ufa/core'
import type { AnswerDraft, AutofillStore } from '@ufa/storage'

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
  /**
   * What the policies allow for each matched field under the current mode and settings: `fill`
   * without selection (trusted mode), `confirm` after the user selects it, or why not.
   */
  decisions: Record<string, PolicyDecision>
  /** Outcome of the latest fill or undo for each field it touched, by field id. */
  results: Record<string, FillResult>
  scanning: boolean
  /** A fill or undo is running. */
  filling: boolean
  /** The latest fill changed fields and can be undone. */
  canUndo: boolean
  /** When the field list was last refreshed, by a scan or a page update. */
  scannedAt: number | null
  /** User armed capture on the connected page. */
  learningArmed: boolean
  /** Values the user typed into unmatched fields while learning was armed. */
  learningCandidates: Record<string, LearningCandidate>
}

export interface FillRequest {
  /**
   * Fields the user selected. Each is filled when its policy decision is `confirm` or `fill`, and
   * reported as skipped with the reason otherwise. Consent fields count as selected only when
   * listed here. Without `fieldIds`, only fields the policy lets fill unselected (trusted mode on
   * a trusted site) are filled.
   */
  fieldIds?: readonly string[]
  /**
   * A saved answer the user picked for a field (answer id by field id), used instead of the best
   * match, for example to settle an ambiguous field. It must be one of the field's compatible
   * candidates.
   */
  choices?: Readonly<Record<string, string>>
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
  /** Extra classifiers, matching strategies and policies; the built-in ones always run. */
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
  /**
   * Fills the fields the request and the policies allow, with the saved answers matched to them,
   * and rescans. Returns one result per field acted on or explicitly requested. Never submits.
   * Page actions run one at a time; a second call waits for the first.
   */
  fill(request?: FillRequest): Promise<FillResult[]>
  /** Puts back what the latest fill replaced, except fields the user changed since. */
  undo(): Promise<RestoreResult[]>
  /** Arms or disarms learning capture on the connected page. */
  setLearningArmed(armed: boolean): Promise<void>
  /** Saves a pending learning candidate as an answer and removes it from the queue. */
  confirmLearning(candidateId: string, draft: AnswerDraft): Promise<string>
  /** Drops a pending learning candidate without saving. */
  rejectLearning(candidateId: string): void
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
