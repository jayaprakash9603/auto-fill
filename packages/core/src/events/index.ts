import type { AutofillErrorCode } from '../errors'
import type { AutofillMode } from '../domain/settings'
import type {
  ClearResult,
  FillResult,
  RestoreResult,
  SyntheticGenerationResult,
} from '../domain/results'
import type { PageInfo } from '../domain/page'

/** Structured events. Payloads never include profile values, only ids, counts and statuses. */
export type AutofillEvent =
  | { type: 'connected'; page: PageInfo }
  | { type: 'scan:start' }
  | { type: 'scan:complete'; page: PageInfo; fieldCount: number; durationMs: number }
  /** The page changed its fields after a scan (a new step, a revealed question, a frame update). */
  | { type: 'fields:changed'; fieldCount: number }
  | { type: 'match:complete'; counts: Record<string, number> }
  | { type: 'fill:complete'; results: FillResult[] }
  | { type: 'clear:complete'; results: ClearResult[] }
  | { type: 'restore:complete'; results: RestoreResult[] }
  | {
      type: 'generate:complete'
      results: Pick<SyntheticGenerationResult, 'fieldId' | 'generatorId' | 'valid'>[]
    }
  | { type: 'learning:candidate'; candidateId: string }
  | { type: 'learning:saved'; candidateId: string; answerId: string }
  | { type: 'learning:rejected'; candidateId: string }
  | { type: 'mode:changed'; mode: AutofillMode }
  | { type: 'profile:changed'; profileId: string | null }
  | { type: 'page:changed'; url: string }
  | {
      type: 'data:changed'
      collection: 'profiles' | 'answers' | 'mappings' | 'settings' | 'candidates'
    }
  | { type: 'plugin:error'; pluginId: string; message: string }
  | { type: 'error'; code: AutofillErrorCode; message: string }

export type AutofillEventType = AutofillEvent['type']
export type AutofillEventOf<T extends AutofillEventType> = Extract<AutofillEvent, { type: T }>
export type AutofillEventHandler<T extends AutofillEventType = AutofillEventType> = (
  event: AutofillEventOf<T>,
) => void

export interface EventBus {
  emit(event: AutofillEvent): void
  on<T extends AutofillEventType>(type: T, handler: AutofillEventHandler<T>): () => void
  onAny(handler: (event: AutofillEvent) => void): () => void
  clear(): void
}

/** Synchronous bus with per-handler error isolation: a throwing handler never breaks the emitter. */
export function createEventBus(onHandlerError?: (error: unknown) => void): EventBus {
  const handlers = new Map<AutofillEventType, Set<(event: AutofillEvent) => void>>()
  const anyHandlers = new Set<(event: AutofillEvent) => void>()

  const invoke = (handler: (event: AutofillEvent) => void, event: AutofillEvent) => {
    try {
      handler(event)
    } catch (error) {
      onHandlerError?.(error)
    }
  }

  return {
    emit(event) {
      handlers.get(event.type)?.forEach((handler) => invoke(handler, event))
      anyHandlers.forEach((handler) => invoke(handler, event))
    },
    on(type, handler) {
      const set = handlers.get(type) ?? new Set()
      const wrapped = handler as (event: AutofillEvent) => void
      set.add(wrapped)
      handlers.set(type, set)
      return () => set.delete(wrapped)
    },
    onAny(handler) {
      anyHandlers.add(handler)
      return () => anyHandlers.delete(handler)
    },
    clear() {
      handlers.clear()
      anyHandlers.clear()
    },
  }
}
