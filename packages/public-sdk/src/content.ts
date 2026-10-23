/**
 * For extensions that bundle their own content script instead of injecting the prebuilt one.
 */
export {
  installAutofillContentRuntime,
  type ContentRuntimeHandle,
  type RuntimeMessagePort,
} from '@ufa/autofill-sdk/content'
export { installExtensionContentRuntime } from '@ufa/extension-bridge/content'
