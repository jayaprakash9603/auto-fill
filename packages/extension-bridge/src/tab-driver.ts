import {
  createRequest,
  isProtocolMessage,
  readResponse,
  runtimeEventEnvelopeSchema,
  type RuntimeRequestType,
  type RuntimeResponseData,
} from '@ufa/autofill-sdk'
import {
  AutofillError,
  fillOperationSchema,
  scanRequestSchema,
  throwIfAborted,
  toAutofillError,
  type FieldDescriptor,
  type FillOperation,
  type FillResult,
  type PageDriver,
  type PageEvent,
  type PageInfo,
  type RestoreResult,
  type ScanResult,
} from '@ufa/core'

import type { ChromeLike, MessageSenderLike, TabLike } from './chrome-like'
import { classifyInjectionError, isRestrictedUrl, resolveActiveWebTab } from './tabs'

export interface ExtensionTabDriverOptions {
  chrome: ChromeLike
  /** Extension-relative path of the injectable runtime, e.g. "form-autofill/content-script.js". */
  contentScriptFile: string
  /** Fixed tab, or a resolver. Defaults to the active web tab of the last focused window. */
  tabId?: number | (() => number | undefined | Promise<number | undefined>)
  /** How long to wait for each frame to answer a ping. */
  pingTimeoutMs?: number
  /** How long to wait for each frame to finish a field scan. */
  scanTimeoutMs?: number
  /** How long to wait for each frame to finish filling or restoring its fields. */
  fillTimeoutMs?: number
}

export interface ExtensionTabDriver extends PageDriver {
  readonly kind: 'extension-tab'
  /** Tab the driver is currently connected to. */
  readonly tabId: number | null
  /** Frames whose runtime answered during the last connect. */
  readonly frameIds: readonly number[]
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/**
 * Page driver for extension pages (side panel, popup, options). Injects the runtime into the
 * target tab on demand, talks to every reachable frame, and forwards runtime events.
 */
export function createExtensionTabDriver(options: ExtensionTabDriverOptions): ExtensionTabDriver {
  const { chrome } = options
  const pingTimeout = options.pingTimeoutMs ?? 2_500
  const scanTimeout = options.scanTimeoutMs ?? 10_000
  const fillTimeout = options.fillTimeoutMs ?? 60_000
  const listeners = new Set<(event: PageEvent) => void>()
  let tabId: number | null = null
  let tabUrl: string | undefined
  let frameIds: number[] = []
  /** The frame that reported each field, so fills reach the document that owns it. */
  const fieldFrames = new Map<string, number>()
  /** Tab-level snapshot ids, each made of the snapshots of the frames it changed. */
  const snapshots = new Map<string, { frameId: number; snapshotId: string }[]>()
  let snapshotCounter = 0
  let detachChromeListeners: (() => void) | null = null
  let disposed = false

  const rememberFrames = (fields: readonly FieldDescriptor[], frameId: number) => {
    for (const [id, owner] of fieldFrames) if (owner === frameId) fieldFrames.delete(id)
    for (const field of fields) fieldFrames.set(field.id, frameId)
  }

  const requireConnection = () => {
    if (disposed) throw new AutofillError('DESTROYED', 'The tab driver was disposed.')
    if (tabId == null || frameIds.length === 0)
      throw new AutofillError('CONTENT_UNAVAILABLE', 'Connect to the page first.')
  }

  const emit = (event: PageEvent) => listeners.forEach((listener) => listener(event))

  const resolveTab = async (): Promise<TabLike | undefined> => {
    const configured = typeof options.tabId === 'function' ? await options.tabId() : options.tabId
    if (configured != null) return chrome.tabs.get(configured)
    return resolveActiveWebTab(chrome)
  }

  const send = async <T extends RuntimeRequestType>(
    type: T,
    payload: object,
    frameId: number,
    timeoutMs = pingTimeout,
  ): Promise<RuntimeResponseData<T>> => {
    if (tabId == null) throw new AutofillError('NO_TAB', 'Not connected to a tab.')
    const request = createRequest(type, payload as never)
    const raw = await withTimeout(
      chrome.tabs.sendMessage(tabId, request, { frameId }),
      timeoutMs,
      () => new AutofillError('CONTENT_UNAVAILABLE', 'The page did not respond in time.'),
    )
    return readResponse(type, raw)
  }

  const withFrame = (fields: readonly FieldDescriptor[], frameId: number): FieldDescriptor[] =>
    fields.map((field) => ({ ...field, frameId }))

  const inject = async (target: number, url: string | undefined): Promise<number[]> => {
    const files = [options.contentScriptFile]
    try {
      const results =
        (await chrome.scripting.executeScript({
          target: { tabId: target, allFrames: true },
          files,
        })) ?? []
      const ids = [...new Set(results.map((result) => result.frameId))]
      return ids.length ? ids.sort((a, b) => a - b) : [0]
    } catch (allFramesError) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: target, frameIds: [0] }, files })
        return [0]
      } catch {
        throw classifyInjectionError(allFramesError, url)
      }
    }
  }

  const attachChromeListeners = () => {
    if (detachChromeListeners) return
    const onMessage = (message: unknown, sender: MessageSenderLike) => {
      if (!isProtocolMessage(message) || message.kind !== 'event') return
      if (sender.tab?.id == null || sender.tab.id !== tabId) return
      const parsed = runtimeEventEnvelopeSchema.safeParse(message)
      if (!parsed.success) return
      const { event } = parsed.data
      if (event.type === 'fields-changed') {
        const frameId = sender.frameId ?? 0
        rememberFrames(event.fields, frameId)
        emit({ type: 'fields-changed', frameId, fields: withFrame(event.fields, frameId) })
      } else {
        emit(event)
      }
    }
    const onUpdated = (
      updatedTabId: number,
      change: { status?: string; url?: string },
      tab: TabLike,
    ) => {
      if (updatedTabId !== tabId) return
      if (change.url && change.url !== tabUrl) {
        tabUrl = change.url
        emit({ type: 'navigated', url: change.url })
      } else if (change.status === 'complete') {
        emit({ type: 'navigated', url: tab.url ?? tabUrl ?? '' })
      }
    }
    const onActivated = (info: { tabId: number }) => {
      if (options.tabId != null || info.tabId === tabId) return
      emit({ type: 'navigated', url: '' })
    }
    const onRemoved = (removedTabId: number) => {
      if (removedTabId !== tabId) return
      tabId = null
      emit({ type: 'disconnected', reason: 'The tab was closed.' })
    }
    chrome.runtime.onMessage.addListener(onMessage)
    chrome.tabs.onUpdated?.addListener(onUpdated)
    chrome.tabs.onActivated?.addListener(onActivated)
    chrome.tabs.onRemoved?.addListener(onRemoved)
    detachChromeListeners = () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      chrome.tabs.onUpdated?.removeListener(onUpdated)
      chrome.tabs.onActivated?.removeListener(onActivated)
      chrome.tabs.onRemoved?.removeListener(onRemoved)
    }
  }

  const driver: ExtensionTabDriver = {
    kind: 'extension-tab',
    get tabId() {
      return tabId
    },
    get frameIds() {
      return frameIds
    },
    async connect(signal) {
      if (disposed) throw new AutofillError('DESTROYED', 'The tab driver was disposed.')
      const tab = await resolveTab()
      throwIfAborted(signal)
      if (tab?.id == null)
        throw new AutofillError('NO_TAB', 'Open a web page in this window to use autofill.')
      if (isRestrictedUrl(tab.url))
        throw new AutofillError(
          'RESTRICTED_PAGE',
          'Browser pages and extension stores cannot be autofilled.',
        )
      tabId = tab.id
      tabUrl = tab.url
      fieldFrames.clear()
      attachChromeListeners()

      const injected = await inject(tab.id, tab.url)
      throwIfAborted(signal)
      const answers = await Promise.all(
        injected.map((frameId) =>
          send('ping', {}, frameId).then(
            (page): [number, PageInfo] => [frameId, page],
            () => null,
          ),
        ),
      )
      const reachable = answers.filter((entry): entry is [number, PageInfo] => entry !== null)
      frameIds = reachable.map(([frameId]) => frameId)
      const top = reachable.find(([frameId]) => frameId === 0) ?? reachable[0]
      if (!top)
        throw new AutofillError(
          'CONTENT_UNAVAILABLE',
          'The page runtime did not start. Reload the page and try again.',
        )
      return { ...top[1], frameCount: reachable.length }
    },
    async scan(request, signal) {
      if (disposed) throw new AutofillError('DESTROYED', 'The tab driver was disposed.')
      if (tabId == null || frameIds.length === 0)
        throw new AutofillError('CONTENT_UNAVAILABLE', 'Connect to the page before scanning.')
      const normalized = scanRequestSchema.parse(request ?? {})
      const results = await Promise.all(
        frameIds.map((frameId) =>
          send('scan', { request: normalized }, frameId, scanTimeout).then(
            (result): [number, ScanResult] => [frameId, result],
            () => null,
          ),
        ),
      )
      throwIfAborted(signal)
      const answered = results.filter((entry): entry is [number, ScanResult] => entry !== null)
      const top = answered.find(([frameId]) => frameId === 0) ?? answered[0]
      if (!top)
        throw new AutofillError(
          'CONTENT_UNAVAILABLE',
          'The page stopped responding. Reload the page and try again.',
        )
      for (const [frameId, result] of answered) rememberFrames(result.fields, frameId)
      return {
        page: { ...top[1].page, frameCount: frameIds.length },
        fields: answered.flatMap(([frameId, result]) => withFrame(result.fields, frameId)),
        scannedAt: Math.max(...answered.map(([, result]) => result.scannedAt)),
      }
    },
    async fill(operations, signal) {
      requireConnection()
      const parsed = operations.map((operation) => fillOperationSchema.parse(operation))
      const byFrame = new Map<number, FillOperation[]>()
      const results = new Map<FillOperation, FillResult>()
      for (const operation of parsed) {
        const frameId = fieldFrames.get(operation.fieldId)
        if (frameId === undefined) {
          results.set(operation, {
            fieldId: operation.fieldId,
            status: 'failed',
            reason: 'The field is no longer on the page.',
            verified: false,
            snapshotId: null,
          })
          continue
        }
        byFrame.set(frameId, [...(byFrame.get(frameId) ?? []), operation])
      }
      snapshotCounter += 1
      const tabSnapshotId = `t${Date.now().toString(36)}${snapshotCounter}`
      const parts: { frameId: number; snapshotId: string }[] = []
      // Frames one after another, top frame first, like a person working down the page.
      for (const frameId of [...byFrame.keys()].sort((a, b) => a - b)) {
        const frameOperations = byFrame.get(frameId) ?? []
        throwIfAborted(signal)
        let frameResults: FillResult[]
        try {
          frameResults = await send('fill', { operations: frameOperations }, frameId, fillTimeout)
        } catch (error) {
          const reason = toAutofillError(error).message
          frameResults = frameOperations.map((operation) => ({
            fieldId: operation.fieldId,
            status: 'failed',
            reason,
            verified: false,
            snapshotId: null,
          }))
        }
        const frameSnapshot = frameResults.find((result) => result.snapshotId)?.snapshotId
        if (frameSnapshot) parts.push({ frameId, snapshotId: frameSnapshot })
        frameOperations.forEach((operation, index) => {
          const result = frameResults[index]
          results.set(
            operation,
            result && result.fieldId === operation.fieldId
              ? { ...result, snapshotId: result.snapshotId ? tabSnapshotId : null }
              : {
                  fieldId: operation.fieldId,
                  status: 'failed',
                  reason: 'The page returned no result for this field.',
                  verified: false,
                  snapshotId: null,
                },
          )
        })
      }
      if (parts.length > 0) snapshots.set(tabSnapshotId, parts)
      return parsed.map((operation) => results.get(operation) as FillResult)
    },
    async restore(snapshotId, signal) {
      requireConnection()
      const parts = snapshots.get(snapshotId)
      if (!parts) return []
      snapshots.delete(snapshotId)
      const results: RestoreResult[] = []
      let failure: unknown = null
      for (const part of parts) {
        throwIfAborted(signal)
        try {
          results.push(
            ...(await send('restore', { snapshotId: part.snapshotId }, part.frameId, fillTimeout)),
          )
        } catch (error) {
          failure = error
        }
      }
      // A frame that reloaded has lost its snapshot; report that only when nothing was restored.
      if (failure && results.length === 0) throw toAutofillError(failure)
      return results
    },
    async setLearningArmed(armed, signal) {
      requireConnection()
      throwIfAborted(signal)
      await Promise.all(
        frameIds.map((frameId) =>
          send('set-learning', { armed }, frameId, pingTimeout).catch(() => undefined),
        ),
      )
    },
    subscribe(listener) {
      listeners.add(listener)
      attachChromeListeners()
      return () => listeners.delete(listener)
    },
    async dispose() {
      disposed = true
      listeners.clear()
      fieldFrames.clear()
      snapshots.clear()
      detachChromeListeners?.()
      detachChromeListeners = null
    },
  }
  return driver
}
