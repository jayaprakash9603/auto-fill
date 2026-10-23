export const AUTOFILL_ERROR_CODES = [
  'NO_TAB',
  'RESTRICTED_PAGE',
  'PERMISSION_REQUIRED',
  'INJECTION_FAILED',
  'CONTENT_UNAVAILABLE',
  'PROTOCOL_ERROR',
  'FIELD_NOT_FOUND',
  'FIELD_CHANGED',
  'VALIDATION_FAILED',
  'STORAGE_ERROR',
  'IMPORT_INVALID',
  'PLUGIN_INVALID',
  'PLUGIN_CONFLICT',
  'PLUGIN_FAILED',
  'CONFIRMATION_REQUIRED',
  'UNSUPPORTED',
  'ABORTED',
  'DESTROYED',
  'UNKNOWN',
] as const

export type AutofillErrorCode = (typeof AUTOFILL_ERROR_CODES)[number]

export class AutofillError extends Error {
  readonly code: AutofillErrorCode
  readonly details: Readonly<Record<string, unknown>> | undefined

  constructor(
    code: AutofillErrorCode,
    message?: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message ?? code, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AutofillError'
    this.code = code
    this.details = options?.details
  }
}

export function isAutofillError(value: unknown): value is AutofillError {
  return value instanceof AutofillError
}

/** Converts anything thrown into an `AutofillError` without leaking non-error payloads. */
export function toAutofillError(
  value: unknown,
  fallback: AutofillErrorCode = 'UNKNOWN',
): AutofillError {
  if (value instanceof AutofillError) return value
  if (value instanceof DOMException && value.name === 'AbortError')
    return new AutofillError('ABORTED', 'Operation cancelled.')
  if (value instanceof Error) return new AutofillError(fallback, value.message, { cause: value })
  return new AutofillError(fallback, typeof value === 'string' ? value : 'Unexpected error.')
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AutofillError('ABORTED', 'Operation cancelled.')
}
