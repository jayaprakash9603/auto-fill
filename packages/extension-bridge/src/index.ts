export type {
  ChromeEventLike,
  ChromeLike,
  InjectionResultLike,
  InjectionTargetLike,
  MessageSenderLike,
  TabLike,
} from './chrome-like'
export {
  createExtensionAutofillHost,
  type ExtensionAutofillHost,
  type ExtensionAutofillHostOptions,
} from './host'
export {
  createExtensionTabDriver,
  type ExtensionTabDriver,
  type ExtensionTabDriverOptions,
} from './tab-driver'
export {
  classifyInjectionError,
  isRestrictedUrl,
  isScriptableUrl,
  originPattern,
  resolveActiveWebTab,
} from './tabs'
