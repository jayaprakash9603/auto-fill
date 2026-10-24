import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import type {
  runtimeErrorSchema,
  runtimeEventEnvelopeSchema,
  runtimeRequestSchema,
  runtimeResponseDataSchemas,
  runtimeResponseSchema,
} from './messages'
import {
  type RuntimeError,
  type RuntimeEventEnvelope,
  type RuntimeRequest,
  type RuntimeResponse,
  type RuntimeResponseData,
} from './messages'

type Simplify<T> = T extends object ? { [K in keyof T]: T[K] } & {} : T
type Identical<A, B> =
  (<T>() => T extends Simplify<A> ? 1 : 2) extends <T>() => T extends Simplify<B> ? 1 : 2
    ? true
    : false
type Out<S extends z.ZodType, T> = Identical<z.output<S>, T>

const checks: Record<string, true> = {
  RuntimeRequest: true satisfies Out<typeof runtimeRequestSchema, RuntimeRequest>,
  RuntimeError: true satisfies Out<typeof runtimeErrorSchema, RuntimeError>,
  RuntimeResponse: true satisfies Out<typeof runtimeResponseSchema, RuntimeResponse>,
  RuntimeEventEnvelope: true satisfies Out<typeof runtimeEventEnvelopeSchema, RuntimeEventEnvelope>,
  PingResponse: true satisfies Out<
    typeof runtimeResponseDataSchemas.ping,
    RuntimeResponseData<'ping'>
  >,
  ScanResponse: true satisfies Out<
    typeof runtimeResponseDataSchemas.scan,
    RuntimeResponseData<'scan'>
  >,
  FillResponse: true satisfies Out<
    typeof runtimeResponseDataSchemas.fill,
    RuntimeResponseData<'fill'>
  >,
  RestoreResponse: true satisfies Out<
    typeof runtimeResponseDataSchemas.restore,
    RuntimeResponseData<'restore'>
  >,
}

describe('protocol types match their schemas', () => {
  it('is enforced by the type checker', () => {
    expect(Object.values(checks).every(Boolean)).toBe(true)
  })
})
