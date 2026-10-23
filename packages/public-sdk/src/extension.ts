/**
 * Extension-page integration. Nothing here reads the `chrome` global; pass yours in.
 */
export {
  createExtensionAutofillHost,
  createExtensionTabDriver,
  isRestrictedUrl,
  isScriptableUrl,
  originPattern,
  type ChromeEventLike,
  type ChromeLike,
  type InjectionResultLike,
  type InjectionTargetLike,
  type MessageSenderLike,
  type TabLike,
  type ExtensionAutofillHost,
  type ExtensionAutofillHostOptions,
  type ExtensionTabDriver,
  type ExtensionTabDriverOptions,
} from '@ufa/extension-bridge'

/** File name of the prebuilt page runtime; copy it into your extension with the `ufa-assets` CLI. */
export const CONTENT_SCRIPT_FILE_NAME = 'content-script.js'
