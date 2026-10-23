import type { PageEvent, PageInfo, ScanRequestInput, ScanResult } from '../domain/page'

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
  subscribe(listener: (event: PageEvent) => void): () => void
  dispose(): Promise<void>
}
