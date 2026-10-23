export { createAutofill } from './controller/create-autofill'
export { createStore, type Store } from './controller/store'
export type {
  AutofillConfiguration,
  AutofillController,
  AutofillHost,
  AutofillState,
  AutofillStateError,
  ConnectionStatus,
} from './controller/types'
export {
  createDomPageDriver,
  type DomPageDriver,
  type DomPageDriverOptions,
} from './dom/dom-page-driver'
export {
  createEventEnvelope,
  createRequest,
  isProtocolMessage,
  readResponse,
  runtimeEventEnvelopeSchema,
  runtimeRequestSchema,
  type RuntimeEventEnvelope,
  type RuntimeRequest,
  type RuntimeRequestType,
  type RuntimeResponse,
  type RuntimeResponseData,
} from './protocol/messages'
export { PROTOCOL_CHANNEL, SDK_VERSION } from './version'
