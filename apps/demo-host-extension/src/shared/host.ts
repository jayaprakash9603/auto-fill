import {
  CONTENT_SCRIPT_FILE_NAME,
  createExtensionAutofillHost,
  type ExtensionAutofillHost,
} from '@universal-form-autofill/sdk/extension'

export function createHost(): ExtensionAutofillHost {
  return createExtensionAutofillHost({
    chrome,
    contentScriptFile: CONTENT_SCRIPT_FILE_NAME,
    storageNamespace: 'ufa-demo',
  })
}
