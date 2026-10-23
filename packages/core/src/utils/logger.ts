export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogRecord {
  level: LogLevel
  scope: string
  message: string
  data?: unknown
  at: number
}

export interface Logger {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
  child(scope: string): Logger
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const LONG_DIGITS = /\+?\d[\d\s().-]{5,}\d/g
const SENSITIVE_KEYS =
  /(value|text|answer|items|password|token|secret|email|phone|name|address|currentValue)$/i

/** Masks personal data in free text: email addresses and long digit sequences. */
export function redactText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(LONG_DIGITS, '[number]')
}

/**
 * Deep-redacts a log payload. Values under keys that commonly hold personal data are replaced,
 * strings are masked and truncated, and depth is bounded.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    const masked = redactText(value)
    return masked.length > 200 ? `${masked.slice(0, 200)}…` : masked
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) }
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => redact(entry, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[key] =
        SENSITIVE_KEYS.test(key) && typeof entry !== 'number' && typeof entry !== 'boolean'
          ? '[redacted]'
          : redact(entry, depth + 1)
    }
    return out
  }
  return '[unserializable]'
}

export interface LoggerOptions {
  scope?: string
  /** Receives already-redacted records. Defaults to the console. */
  sink?: (record: LogRecord) => void
  minLevel?: LogLevel
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const consoleSink = (record: LogRecord) => {
  const line = `[ufa:${record.scope}] ${record.message}`
  const method = record.level === 'debug' ? 'debug' : record.level
  if (record.data === undefined) console[method](line)
  else console[method](line, record.data)
}

/** Logger that redacts every payload before it reaches the sink. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const scope = options.scope ?? 'autofill'
  const sink = options.sink ?? consoleSink
  const min = LEVEL_ORDER[options.minLevel ?? 'warn']

  const write = (level: LogLevel, message: string, data?: unknown) => {
    if (LEVEL_ORDER[level] < min) return
    sink({
      level,
      scope,
      message: redactText(message),
      data: data === undefined ? undefined : redact(data),
      at: Date.now(),
    })
  }

  return {
    debug: (message, data) => write('debug', message, data),
    info: (message, data) => write('info', message, data),
    warn: (message, data) => write('warn', message, data),
    error: (message, data) => write('error', message, data),
    child: (child) => createLogger({ ...options, scope: `${scope}:${child}` }),
  }
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
}
