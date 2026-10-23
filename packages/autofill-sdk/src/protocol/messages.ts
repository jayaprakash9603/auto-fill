import {
  AUTOFILL_ERROR_CODES,
  AutofillError,
  pageEventSchema,
  pageInfoSchema,
  type AutofillErrorCode,
  type PageEvent,
  type PageInfo,
} from '@ufa/core'
import { z } from 'zod'

import { PROTOCOL_CHANNEL } from '../version'

export interface PingRequest {
  channel: typeof PROTOCOL_CHANNEL
  kind: 'request'
  requestId: string
  type: 'ping'
}
export type RuntimeRequest = PingRequest
export type RuntimeRequestType = RuntimeRequest['type']

export interface RuntimeResponseDataMap {
  ping: PageInfo
}
export type RuntimeResponseData<T extends RuntimeRequestType> = RuntimeResponseDataMap[T]

export interface RuntimeError {
  code: AutofillErrorCode
  message: string
}
export type RuntimeResponse = { ok: true; data: unknown } | { ok: false; error: RuntimeError }

export interface RuntimeEventEnvelope {
  channel: typeof PROTOCOL_CHANNEL
  kind: 'event'
  event: PageEvent
}

const requestBase = {
  channel: z.literal(PROTOCOL_CHANNEL),
  kind: z.literal('request'),
  requestId: z.string().min(1).max(100),
}

export const runtimeRequestSchema = z.discriminatedUnion('type', [
  z.object({ ...requestBase, type: z.literal('ping') }),
])

/** Response payload schemas, validated by the caller so a compromised page cannot inject shapes. */
export const runtimeResponseDataSchemas = {
  ping: pageInfoSchema,
} satisfies { [K in RuntimeRequestType]: z.ZodType<RuntimeResponseDataMap[K]> }

export const runtimeErrorSchema = z.object({
  code: z.enum(AUTOFILL_ERROR_CODES),
  message: z.string().max(2_000),
})

export const runtimeResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: runtimeErrorSchema }),
])

export const runtimeEventEnvelopeSchema = z.object({
  channel: z.literal(PROTOCOL_CHANNEL),
  kind: z.literal('event'),
  event: pageEventSchema,
})

export function isProtocolMessage(
  raw: unknown,
): raw is { channel: typeof PROTOCOL_CHANNEL; kind: string } {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { channel?: unknown }).channel === PROTOCOL_CHANNEL
  )
}

export function createEventEnvelope(event: PageEvent): RuntimeEventEnvelope {
  return { channel: PROTOCOL_CHANNEL, kind: 'event', event }
}

let requestCounter = 0
export function createRequest<T extends RuntimeRequestType>(
  type: T,
  payload: Omit<Extract<RuntimeRequest, { type: T }>, 'channel' | 'kind' | 'requestId' | 'type'>,
): Extract<RuntimeRequest, { type: T }> {
  requestCounter += 1
  return {
    channel: PROTOCOL_CHANNEL,
    kind: 'request',
    requestId: `r${Date.now().toString(36)}${requestCounter}`,
    type,
    ...payload,
  } as Extract<RuntimeRequest, { type: T }>
}

export function errorResponse(code: AutofillErrorCode, message: string): RuntimeResponse {
  return { ok: false, error: { code, message: message.slice(0, 2_000) } }
}

/** Validates a raw response and returns typed data, or throws the runtime's error. */
export function readResponse<T extends RuntimeRequestType>(
  type: T,
  raw: unknown,
): RuntimeResponseData<T> {
  const envelope = runtimeResponseSchema.safeParse(raw)
  if (!envelope.success)
    throw new AutofillError('PROTOCOL_ERROR', 'The page runtime returned an invalid response.')
  if (!envelope.data.ok)
    throw new AutofillError(envelope.data.error.code, envelope.data.error.message)
  const data = runtimeResponseDataSchemas[type].safeParse(envelope.data.data)
  if (!data.success)
    throw new AutofillError('PROTOCOL_ERROR', `Invalid ${type} response from the page runtime.`)
  return data.data as RuntimeResponseData<T>
}
